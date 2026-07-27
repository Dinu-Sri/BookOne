#!/usr/bin/env bash
# Rebuild and restart ONLY the ERP web service (not e2e, not full stack).
# Run ON the VPS after: git pull (or Portainer already pulled files).
#
# Usage:
#   chmod +x scripts/rebuild-web-only.sh
#   ./scripts/rebuild-web-only.sh
#   ./scripts/rebuild-web-only.sh /data/compose/2   # optional stack dir
#
set -euo pipefail

STACK_DIR="${1:-}"
COMPOSE_FILE=""

find_compose() {
  local d="$1"
  for f in \
    "$d/docker-compose.staging.yml" \
    "$d/docker/docker-compose.staging.yml" \
    "$d/docker-compose.yml" \
    "$d/compose.yml"
  do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

if [[ -n "$STACK_DIR" ]]; then
  cd "$STACK_DIR"
elif [[ -f "docker/docker-compose.staging.yml" ]]; then
  cd "$(pwd)"
elif [[ -f "docker-compose.staging.yml" ]]; then
  cd "$(pwd)"
else
  # Try Portainer compose data dir
  if [[ -d /data/compose ]]; then
    echo "Looking under /data/compose ..."
    FOUND=""
    while IFS= read -r dir; do
      if c=$(find_compose "$dir"); then
        FOUND="$dir"
        COMPOSE_FILE="$c"
        break
      fi
    done < <(find /data/compose -maxdepth 2 -type d 2>/dev/null | sort -r)
    if [[ -n "$FOUND" ]]; then
      cd "$FOUND"
    else
      echo "Could not find compose file. Pass stack directory:"
      echo "  $0 /path/to/stack"
      exit 1
    fi
  else
    echo "Run from BookOne repo root, or pass Portainer stack dir."
    exit 1
  fi
fi

if [[ -z "$COMPOSE_FILE" ]]; then
  COMPOSE_FILE=$(find_compose "$(pwd)" || true)
fi

if [[ -z "$COMPOSE_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  echo "No compose file in $(pwd)"
  exit 1
fi

echo "=== Rebuild web only ==="
echo "Dir:     $(pwd)"
echo "Compose: $COMPOSE_FILE"
echo ""

# Pull latest git if this is a git checkout
if [[ -d .git ]]; then
  echo "git pull origin master ..."
  git pull origin master || true
fi

echo "docker compose build web ..."
docker compose -f "$COMPOSE_FILE" build web

echo "docker compose up -d web ..."
docker compose -f "$COMPOSE_FILE" up -d web

echo ""
echo "=== Done. Web container status: ==="
docker compose -f "$COMPOSE_FILE" ps web 2>/dev/null || docker ps --filter name=web --format "table {{.Names}}\t{{.Status}}"
echo ""
echo "Logs (last 20 lines):"
docker compose -f "$COMPOSE_FILE" logs web --tail 20 2>/dev/null || true
