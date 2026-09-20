#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
compose=(docker compose --env-file "${IMS_DEPLOY_ENV:-deploy/.env}" -p "${IMS_COMPOSE_PROJECT:-ims}" -f compose.yaml)
if [[ "${IMS_LOCAL_HTTP:-0}" == 1 ]]; then compose+=(-f deploy/compose.local.yaml); fi
saved_database=ims
database_file="${IMS_DATABASE_FILE:-deploy/database}"
if [[ -f "$database_file" ]]; then saved_database=$(cat "$database_file"); fi
db_name="${IMS_DATABASE:-$saved_database}"
if [[ ! "$db_name" =~ ^ims(_restore_[a-z0-9_]+)?$ || ${#db_name} -gt 63 ]]; then echo 'Unexpected deployment database name.' >&2; exit 1; fi
export IMS_DATABASE="$db_name"
psql_db() { "${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -U ims_owner -d "$db_name" "$@"; }
grants() { psql_db < deploy/grants.sql; }
case "${1:-help}" in
  build) "${compose[@]}" build app ops ;;
  migrate)
    "${compose[@]}" up -d --wait db
    "${compose[@]}" run --rm ops npm run db:migrate
    grants ;;
  seed)
    "${compose[@]}" run --rm ops npm run db:seed
    "${compose[@]}" run --rm ops npm run db:seed:users
    "${compose[@]}" run --rm -e ALLOW_DEMO_SEED=true ops npm run db:seed:demo ;;
  seed-demo) "${compose[@]}" run --rm -e ALLOW_DEMO_SEED=true ops npm run db:seed:demo ;;
  up) "${compose[@]}" up -d --wait app ;;
  verify) "${compose[@]}" run --rm ops npm run db:verify-ledger ;;
  status) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail 100 app db ;;
  restart)
    "${compose[@]}" restart db app
    "${compose[@]}" up -d --wait app ;;
  stop) "${compose[@]}" stop app db ;;
  backup)
    mkdir -p .local/backups
    backup=".local/backups/ims-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
    trap 'rm -f "$backup.partial"' EXIT
    "${compose[@]}" exec -T db pg_dump -U ims_owner -d "$db_name" --format=custom --no-owner --no-acl --exclude-table-data=public.web_sessions > "$backup.partial"
    mv "$backup.partial" "$backup"
    echo "$backup" ;;
  restore)
    backup="${2:?Supply a backup path}"; target="${3:?Supply a NEW database named ims_restore_NAME}"
    if [[ ! "$target" =~ ^ims_restore_[a-z0-9_]+$ || ${#target} -gt 63 ]]; then echo 'Restore only accepts a fresh ims_restore_NAME database.' >&2; exit 1; fi
    test -f "$backup"
    "${compose[@]}" exec -T db pg_restore --list < "$backup" > /dev/null
    # createdb fails if the target exists. Never drop or overwrite a database.
    "${compose[@]}" exec -T db createdb -U ims_owner -O ims_owner "$target"
    "${compose[@]}" exec -T db pg_restore -U ims_owner -d "$target" --single-transaction --exit-on-error --no-owner --no-acl < "$backup"
    db_name="$target"; grants
    IMS_DATABASE="$target" "${compose[@]}" run --rm ops npm run db:verify-ledger
    echo "Restored to $target. The running app still uses its original database." ;;
  fingerprint)
    # Small-demo verification: hashes business rows and sequence positions; excludes expiring sessions.
    psql_db -At < deploy/fingerprint.sql ;;
  check-role) psql_db < deploy/check-role.sql ;;
  activate)
    target="${2:?Supply a verified ims or ims_restore_NAME database}"
    if [[ ! "$target" =~ ^ims(_restore_[a-z0-9_]+)?$ || ${#target} -gt 63 ]]; then echo 'Unexpected database name.' >&2; exit 1; fi
    db_name="$target"; psql_db -c 'SELECT 1 FROM products LIMIT 1' > /dev/null
    printf '%s\n' "$target" > "$database_file"
    export IMS_DATABASE="$target"
    "${compose[@]}" up -d --wait app
    echo "The app now uses $target. Recreate the tunnel with the tunnel command if it is enabled." ;;
  tunnel)
    if [[ "${IMS_LOCAL_HTTP:-0}" == 1 ]]; then echo 'Disable IMS_LOCAL_HTTP before starting the HTTPS tunnel.' >&2; exit 1; fi
    test -s .local/secrets/tunnel-token
    "${compose[@]}" -f deploy/compose.tunnel.yaml up -d --wait --force-recreate app tunnel ;;
  *) echo 'Usage: npm run deploy -- build|migrate|seed|seed-demo|up|verify|check-role|status|logs|restart|stop|backup|restore FILE ims_restore_NAME|activate DATABASE|fingerprint|tunnel'; exit 1 ;;
esac
