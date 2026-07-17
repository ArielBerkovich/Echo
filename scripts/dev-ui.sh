#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${JWT_SECRET:-}" && ! -f .env ]]; then
  echo "Error: JWT_SECRET is required. Set it in the environment or in $ROOT_DIR/.env." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

"${COMPOSE[@]}" -f docker-compose.yml -f docker-compose.dev.yml up -d --build \
  mongo mongo-init minio server

cleanup() {
  "${COMPOSE[@]}" -f docker-compose.yml -f docker-compose.dev.yml stop server mongo-init minio mongo >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Echo API is available at http://localhost:4000"
echo "Starting the UI at http://localhost:5173"
npm --prefix client run dev -- --host 0.0.0.0
