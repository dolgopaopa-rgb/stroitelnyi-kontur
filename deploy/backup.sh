#!/usr/bin/env bash
set -euo pipefail

mkdir -p data/backups
docker compose exec -T app python app/backup_sqlite.py
ls -lh data/backups | tail -n 5
