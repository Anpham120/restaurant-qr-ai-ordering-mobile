#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

backup_file="${1:?Usage: restore-postgres.sh /opt/cmc-restaurant/<env>/backups/<file>.dump}"
remote_root="/opt/cmc-restaurant/${DEPLOY_ENV}"
compose_file="${remote_root}/repo/deploy/docker-compose.java.yml"
env_file="${remote_root}/.env"

if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file" >&2
  exit 1
fi

if [ -f "${backup_file}.sha256" ]; then
  sha256sum -c "${backup_file}.sha256"
fi

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" stop api

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" exec -T postgres \
  dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" exec -T postgres \
  createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl < "$backup_file"

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" up -d api
bash "${remote_root}/repo/deploy/scripts/health-check.sh"

echo "PostgreSQL restore completed from: $backup_file"
