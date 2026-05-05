#!/usr/bin/env bash
set -euo pipefail

git pull
mkdir -p data/backups
docker compose up -d --build
docker compose ps
