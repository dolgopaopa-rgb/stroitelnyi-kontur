#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "File .env not found. Create it from .env.example and set DOMAIN and APP_BASIC_AUTH_PASSWORD."
  exit 1
fi

mkdir -p data/backups
export APP_COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse --short HEAD)}"
export APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
export APP_DEPLOYED_AT="${APP_DEPLOYED_AT:-$APP_BUILD_TIME}"
docker compose up -d --build
docker compose ps

echo "Waiting for health check..."
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1/health >/dev/null; then
    echo "Application is healthy."
    exit 0
  fi
  sleep 2
done

echo "Application did not become healthy in time. Show logs with: docker compose logs -f"
exit 1
