#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: deploy/staging-rollback.sh <commit-or-branch>"
  exit 1
fi

TARGET="$1"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-stroitelnyi-kontur-staging}"

git fetch --all --prune
git checkout "$TARGET"
deploy/staging-up.sh

echo "Staging rolled back to: $(git rev-parse --short HEAD)"
