#!/usr/bin/env bash
set -euo pipefail

git pull
export APP_COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse --short HEAD)}"
export APP_VERSION="${APP_VERSION:-$(grep -m1 '"version"' package.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')}"
export APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
export APP_DEPLOYED_AT="${APP_DEPLOYED_AT:-$APP_BUILD_TIME}"
mkdir -p data/backups
docker compose up -d --build
docker compose ps
