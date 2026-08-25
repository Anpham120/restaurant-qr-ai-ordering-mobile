#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

backup_reason="${1:-manual}"
remote_root="/opt/cmc-restaurant/${DEPLOY_ENV}"
compose_file="${remote_root}/repo/deploy/docker-compose.java.yml"
env_file="${remote_root}/.env"
backup_dir="${remote_root}/backups"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_file="${backup_dir}/${POSTGRES_DB}-${timestamp}-${backup_reason}.dump"

mkdir -p "$backup_dir"

docker compose --env-file "$env_file" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl > "$backup_file"

sha256sum "$backup_file" > "${backup_file}.sha256"
find "$backup_dir" -type f -name "*.dump" -mtime +14 -delete
find "$backup_dir" -type f -name "*.sha256" -mtime +14 -delete

echo "PostgreSQL backup created: $backup_file"
