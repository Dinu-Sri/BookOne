#!/usr/bin/env bash
# Rebuild ONLY e2e service (use rarely — Playwright image is slow).
set -euo pipefail

COMPOSE_FILE="${1:-docker/docker-compose.staging.yml}"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  COMPOSE_FILE="docker-compose.staging.yml"
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found. Usage: $0 path/to/docker-compose.staging.yml"
  exit 1
fi

echo "Building e2e only (profile e2e)..."
docker compose -f "$COMPOSE_FILE" --profile e2e build e2e
docker compose -f "$COMPOSE_FILE" --profile e2e up -d e2e
docker compose -f "$COMPOSE_FILE" --profile e2e ps e2e
