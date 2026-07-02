#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-stroitelnyi-kontur-staging}"
export APP_COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse --short HEAD)}"
export APP_VERSION="${APP_VERSION:-$(grep -m1 '"version"' package.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')}"
export APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
export APP_DEPLOYED_AT="${APP_DEPLOYED_AT:-$APP_BUILD_TIME}"
export STAGING_PUBLIC_URL="${STAGING_PUBLIC_URL:-https://staging.79-143-30-43.sslip.io}"
export STAGING_STORAGE_PROVIDER="${STAGING_STORAGE_PROVIDER:-local}"
export STAGING_MAX_TOKEN="${STAGING_MAX_TOKEN:-}"

mkdir -p data/backups qa-artifacts/latest
docker compose -f docker-compose.staging.yml up -d --build staging_app
docker compose -f docker-compose.staging.yml ps
