#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${DEPLOY_STACK_DIR:?DEPLOY_STACK_DIR is required}"
: "${PRODUCTION_URL:?PRODUCTION_URL is required}"

short_sha=${GITHUB_SHA:0:12}
release_app_image="personal-web-inventory-management:release-${short_sha}"
release_ops_image="personal-web-inventory-ops:release-${short_sha}"
production_app_image="personal-web-inventory-management:1"
production_ops_image="personal-web-inventory-ops:1"
rollback_app_image="personal-web-inventory-management:rollback-before-${short_sha}"
candidate_container="inventory-candidate-${GITHUB_RUN_ID}"
override_file="${DEPLOY_STACK_DIR}/compose.inventory.yml"
deploy_root="${DEPLOY_STACK_DIR}/apps/inventory-management"
deploy_env="${deploy_root}/deploy/.env"
database_file="${deploy_root}/deploy/database"
backup_dir="${deploy_root}/.local/backups"
compose=(docker compose --env-file "$deploy_env" -p ims -f compose.yaml -f "$override_file")
promoted=0

cleanup() {
  status=$?
  set +e
  docker container rm --force "$candidate_container" >/dev/null 2>&1
  if [[ $status -ne 0 && $promoted -eq 1 ]]; then
    echo "Deployment failed after promotion; restoring ${rollback_app_image}." >&2
    docker image tag "$rollback_app_image" "$production_app_image"
    IMS_APP_IMAGE="$production_app_image" IMS_OPS_IMAGE="$production_ops_image" \
      "${compose[@]}" up -d --no-deps --force-recreate --wait app
  fi
  exit "$status"
}
trap cleanup EXIT

test -f "$override_file"
test -f "$deploy_env"
set -a
# The generated file contains only URL-safe deployment secrets.
source "$deploy_env"
set +a
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"

active_database=ims
if [[ -f "$database_file" ]]; then
  active_database=$(<"$database_file")
fi
if [[ ! "$active_database" =~ ^ims(_restore_[a-z0-9_]+)?$ || ${#active_database} -gt 63 ]]; then
  echo "Unexpected deployment database name." >&2
  exit 1
fi
export IMS_DATABASE="$active_database"

current_app_image=$(docker inspect ims-app-1 --format '{{.Image}}')
docker image tag "$current_app_image" "$rollback_app_image"

docker build \
  --target runtime \
  --build-arg BASE_PATH=/projects/inventory-management/ \
  --label "org.opencontainers.image.revision=${GITHUB_SHA}" \
  --tag "$release_app_image" \
  .
docker build \
  --target ops \
  --build-arg BASE_PATH=/projects/inventory-management/ \
  --label "org.opencontainers.image.revision=${GITHUB_SHA}" \
  --tag "$release_ops_image" \
  .

export IMS_APP_IMAGE="$release_app_image"
export IMS_OPS_IMAGE="$release_ops_image"
"${compose[@]}" up -d --wait db

umask 077
mkdir -p "$backup_dir"
backup_file="${backup_dir}/ims-$(date -u +%Y%m%dT%H%M%SZ)-${short_sha}.dump"
"${compose[@]}" exec -T db \
  pg_dump -U ims_owner -d "$active_database" --format=custom --no-owner --no-acl \
  --exclude-table-data=public.web_sessions > "$backup_file"
test -s "$backup_file"
echo "Created pre-deployment backup: ${backup_file}"

"${compose[@]}" run --rm ops npm run db:migrate
"${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -U ims_owner \
  -d "$active_database" < deploy/grants.sql
"${compose[@]}" run --rm ops npm run db:verify-ledger
"${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -U ims_owner \
  -d "$active_database" < deploy/check-role.sql

docker run --detach \
  --name "$candidate_container" \
  --network ims_default \
  --env "DATABASE_URL=postgresql://ims_app:${DB_APP_PASSWORD}@db:5432/${active_database}" \
  --env "SESSION_SECRET=${SESSION_SECRET}" \
  --env COOKIE_SECURE=true \
  --env TRUST_PROXY=1 \
  --env PUBLIC_DEMO=true \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000 \
  --user 1000:1000 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  "$release_app_image" >/dev/null

for attempt in {1..45}; do
  if docker exec "$candidate_container" node -e \
      "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    break
  fi
  if [[ $attempt -eq 45 ]]; then
    docker logs "$candidate_container"
    exit 1
  fi
  sleep 2
done
candidate_html=$(docker exec "$candidate_container" node -e \
  "fetch('http://127.0.0.1:4000/').then(r=>r.text()).then(console.log)")
grep -F '/projects/inventory-management/assets/' <<< "$candidate_html" >/dev/null

docker container rm --force "$candidate_container" >/dev/null
docker image tag "$release_app_image" "$production_app_image"
docker image tag "$release_ops_image" "$production_ops_image"
export IMS_APP_IMAGE="$production_app_image"
export IMS_OPS_IMAGE="$production_ops_image"
promoted=1
"${compose[@]}" up -d --no-deps --force-recreate --wait app

deployed_revision=$(docker inspect ims-app-1 --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
test "$deployed_revision" = "$GITHUB_SHA"
"${compose[@]}" run --rm ops npm run db:verify-ledger
docker run --rm \
  --env "IMS_BASE_URL=${PRODUCTION_URL%/}/projects/inventory-management" \
  "$production_ops_image" \
  node --import tsx scripts/release-smoke.ts login /tmp/release-session.json

promoted=0
echo "Inventory Management ${GITHUB_SHA} is live; rollback image: ${rollback_app_image}."
