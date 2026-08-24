#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}"

remote_root="/opt/cmc-restaurant/${DEPLOY_ENV}"
cd "$remote_root"

if [ ! -d repo.previous ]; then
  echo "No repo.previous directory found for rollback." >&2
  exit 1
fi

rollback_stamp="$(date -u +"%Y%m%d%H%M%S")"
if [ -d repo ]; then
  mv repo "repo.failed.${rollback_stamp}"
fi
mv repo.previous repo

set -a
. ./.env
set +a

docker compose --env-file .env -f repo/deploy/docker-compose.java.yml -p "$COMPOSE_PROJECT_NAME" up -d --build --remove-orphans
bash repo/deploy/scripts/backup-postgres.sh "rollback-${rollback_stamp}"
bash repo/deploy/scripts/write-nginx-config.sh
bash repo/deploy/scripts/health-check.sh

echo "Rollback completed for ${DEPLOY_ENV}"
