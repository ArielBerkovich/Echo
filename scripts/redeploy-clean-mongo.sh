#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # Load local deployment settings for the compose interpolation below.
  # Compose reads .env too, but sourcing it here lets us validate required vars
  # before we tear anything down.
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "Error: JWT_SECRET is required."
  echo "Set it in your shell or create a .env file in $ROOT_DIR before running this script."
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f docker-compose.yml)
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f docker-compose.yml)
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

cleanup_stale_endpoints() {
  local container_ids
  mapfile -t container_ids < <(docker ps -aq --filter network=echo_default)

  if ((${#container_ids[@]} == 0)); then
    return 0
  fi

  echo "Removing stale container(s) still attached to echo_default..."
  docker rm -f "${container_ids[@]}"
}

echo "Stopping Echo Compose stack..."
if ! "${COMPOSE[@]}" down --remove-orphans; then
  cleanup_stale_endpoints
  "${COMPOSE[@]}" down --remove-orphans
fi

echo "Removing Compose MongoDB volume(s)..."
mapfile -t MONGO_VOLUMES < <(docker volume ls -q --filter label=com.docker.compose.volume=mongo-data)

if ((${#MONGO_VOLUMES[@]} == 0)); then
  echo "No MongoDB volume found."
else
  docker volume rm -f "${MONGO_VOLUMES[@]}"
fi

echo "Rebuilding and starting Echo..."
"${COMPOSE[@]}" up -d --build
