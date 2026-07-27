#!/usr/bin/env bash
# Smart deploy: after git pull, rebuild ONLY services affected by changed files.
#
# Run ON the VPS (or any machine with Docker + git checkout of BookOne):
#   git pull origin master
#   chmod +x scripts/smart-deploy.sh
#   ./scripts/smart-deploy.sh
#
# Optional:
#   ./scripts/smart-deploy.sh --force-web     # always rebuild web
#   ./scripts/smart-deploy.sh --force-all    # web + docs + e2e (if profiles allow)
#   COMPOSE_FILE=docker/docker-compose.staging.yml ./scripts/smart-deploy.sh
#
# State file: .deploy-last-sha (commit that was last successfully deployed)
# First run with no state → rebuilds web only (safe default for current ERP work).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STATE_FILE="${DEPLOY_STATE_FILE:-$ROOT/.deploy-last-sha}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
FORCE_WEB=0
FORCE_ALL=0
FORCE_E2E=0
FORCE_DOCS=0

for arg in "$@"; do
  case "$arg" in
    --force-web) FORCE_WEB=1 ;;
    --force-e2e) FORCE_E2E=1 ;;
    --force-docs) FORCE_DOCS=1 ;;
    --force-all) FORCE_ALL=1 ;;
    --help|-h)
      echo "Usage: $0 [--force-web|--force-e2e|--force-docs|--force-all]"
      exit 0
      ;;
  esac
done

find_compose() {
  for f in \
    "$ROOT/docker/docker-compose.staging.yml" \
    "$ROOT/docker-compose.staging.yml" \
    "$ROOT/docker/docker-compose.prod.yml" \
    "$ROOT/docker-compose.yml"
  do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

if [[ -z "$COMPOSE_FILE" ]]; then
  COMPOSE_FILE="$(find_compose || true)"
fi
if [[ -z "$COMPOSE_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: compose file not found. Set COMPOSE_FILE=..."
  exit 1
fi

echo "=== BookOne smart-deploy ==="
echo "Repo:    $ROOT"
echo "Compose: $COMPOSE_FILE"
echo ""

# Ensure we have latest (if this is a git repo)
if [[ -d .git ]]; then
  echo "→ git fetch && pull master..."
  git fetch origin master 2>/dev/null || git fetch origin 2>/dev/null || true
  git pull origin master 2>/dev/null || git pull 2>/dev/null || true
fi

HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
BASE_SHA=""
if [[ -f "$STATE_FILE" ]]; then
  BASE_SHA="$(tr -d '[:space:]' < "$STATE_FILE")"
fi

if [[ -z "$BASE_SHA" || "$BASE_SHA" == "unknown" ]]; then
  echo "→ No previous deploy SHA (first run or missing .deploy-last-sha)"
  echo "  Default: rebuild WEB only (current development focus)."
  CHANGED="FORCE_DEFAULT_WEB"
else
  if git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
    echo "→ Changes since last deploy: $BASE_SHA → $HEAD_SHA"
    CHANGED="$(git diff --name-only "$BASE_SHA" "$HEAD_SHA" 2>/dev/null || true)"
  else
    echo "→ Last deploy SHA not in history; defaulting to WEB only"
    CHANGED="FORCE_DEFAULT_WEB"
  fi
fi

NEED_WEB=0
NEED_E2E=0
NEED_DOCS=0

if [[ "$FORCE_ALL" == "1" ]]; then
  NEED_WEB=1; NEED_E2E=1; NEED_DOCS=1
fi
if [[ "$FORCE_WEB" == "1" ]]; then NEED_WEB=1; fi
if [[ "$FORCE_E2E" == "1" ]]; then NEED_E2E=1; fi
if [[ "$FORCE_DOCS" == "1" ]]; then NEED_DOCS=1; fi

if [[ "$CHANGED" == "FORCE_DEFAULT_WEB" ]]; then
  NEED_WEB=1
else
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      # ERP / monorepo app
      apps/web/*|packages/*|scripts/init-db.ts|scripts/seed*|docker/Dockerfile.web|docker/entrypoint.sh|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json|tsconfig.base.json)
        NEED_WEB=1
        ;;
      # E2E runner only
      apps/e2e-runner/*|docker/Dockerfile.e2e)
        NEED_E2E=1
        ;;
      # Docs reverse-proxy only
      docker/Dockerfile.docs|docker/docs.nginx.conf)
        NEED_DOCS=1
        ;;
      # Compose / deploy scripts — no image rebuild required
      docker/docker-compose*.yml|scripts/smart-deploy.sh|scripts/rebuild-*.sh|docs/*)
        ;;
      # Anything else that might affect web runtime
      *)
        # Conservative: unknown paths under apps/ or packages/ → web
        if [[ "$f" == apps/* || "$f" == packages/* || "$f" == docker/* ]]; then
          NEED_WEB=1
        fi
        ;;
    esac
  done <<< "$CHANGED"
fi

# If nothing matched but there were commits, still touch web for safety on code paths
if [[ "$NEED_WEB$NEED_E2E$NEED_DOCS" == "000" && -n "$CHANGED" && "$CHANGED" != "FORCE_DEFAULT_WEB" ]]; then
  if echo "$CHANGED" | grep -qE '^(apps/|packages/)'; then
    NEED_WEB=1
  else
    echo "→ No service-related file changes (docs/scripts only). Skip builds."
    echo "$HEAD_SHA" > "$STATE_FILE"
    echo "Saved deploy SHA $HEAD_SHA"
    exit 0
  fi
fi

echo ""
echo "Plan:"
[[ "$NEED_WEB" == "1" ]] && echo "  ✓ build + up  web"
[[ "$NEED_DOCS" == "1" ]] && echo "  ✓ build + up  docs  (profile docs)"
[[ "$NEED_E2E" == "1" ]] && echo "  ✓ build + up  e2e  (profile e2e — slow)"
[[ "$NEED_WEB$NEED_DOCS$NEED_E2E" == "000" ]] && echo "  (nothing)"
echo ""

dc() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

if [[ "$NEED_WEB" == "1" ]]; then
  echo ">>> Building web..."
  dc build web
  echo ">>> Starting web..."
  dc up -d web
fi

if [[ "$NEED_DOCS" == "1" ]]; then
  echo ">>> Building docs..."
  dc --profile docs build docs
  echo ">>> Starting docs..."
  dc --profile docs up -d docs
fi

if [[ "$NEED_E2E" == "1" ]]; then
  echo ">>> Building e2e (this can take a long time)..."
  dc --profile e2e build e2e
  echo ">>> Starting e2e..."
  dc --profile e2e up -d e2e
fi

echo "$HEAD_SHA" > "$STATE_FILE"
echo ""
echo "=== Done. Saved deploy SHA: $HEAD_SHA ==="
dc ps 2>/dev/null || true
