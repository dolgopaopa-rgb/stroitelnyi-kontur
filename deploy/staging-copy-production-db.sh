#!/usr/bin/env bash
set -euo pipefail

PRODUCTION_DIR="${PRODUCTION_DIR:-/opt/stroitelnyi-kontur}"
STAGING_DIR="${STAGING_DIR:-/opt/stroitelnyi-kontur-staging}"
STAGING_COMPOSE_PROJECT="${STAGING_COMPOSE_PROJECT:-stroitelnyi-kontur-staging}"

cd "$PRODUCTION_DIR"
mkdir -p data/backups
docker compose exec -T app python app/backup_sqlite.py >/tmp/kontur-prod-backup.log
LATEST_BACKUP="$(ls -1t data/backups/*.db | head -1)"

cd "$STAGING_DIR"
export COMPOSE_PROJECT_NAME="$STAGING_COMPOSE_PROJECT"
docker compose -f docker-compose.staging.yml up -d app
STAGING_APP_CONTAINER="$(docker compose -f docker-compose.staging.yml ps -q app)"

docker cp "$PRODUCTION_DIR/$LATEST_BACKUP" "$STAGING_APP_CONTAINER:/tmp/staging-source.db"
docker exec "$STAGING_APP_CONTAINER" sh -lc 'cp /data/construction.db /data/construction.db.before-staging-refresh-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true; cp /tmp/staging-source.db /data/construction.db'
docker compose -f docker-compose.staging.yml restart app

echo "Staging database refreshed from production backup: $LATEST_BACKUP"
