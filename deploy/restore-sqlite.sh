#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: deploy/restore-sqlite.sh data/backups/construction-YYYYMMDD-HHMMSS.db"
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file"
  exit 1
fi

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "This will replace the current database."
  echo "Run again as: RESTORE_CONFIRM=yes deploy/restore-sqlite.sh $backup_file"
  exit 1
fi

absolute_backup="$(realpath "$backup_file")"
docker compose stop app
docker compose run --rm --no-deps -v "$absolute_backup:/restore.db:ro" app sh -lc 'if [ -f /data/construction.db ]; then cp /data/construction.db /data/construction.db.before-restore-$(date +%Y%m%d-%H%M%S); fi; cp /restore.db /data/construction.db'
docker compose up -d app
docker compose ps
