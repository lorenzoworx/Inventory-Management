#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# CI owns this isolated project. No existing host deployment is selected.
export IMS_COMPOSE_PROJECT="ims-ci-${GITHUB_RUN_ID:-local-$RANDOM}"
export IMS_DEPLOY_ENV=.local/container-check.env
export IMS_DATABASE_FILE=.local/container-check-database
export IMS_DATABASE=ims
export IMS_LOCAL_HTTP=1
export IMS_HTTP_PORT=4299
export IMS_BASE_URL=http://127.0.0.1:4299
mkdir -p .local
npm run setup:deploy
npm run deploy -- build
npm run deploy -- migrate
npm run deploy -- seed
npm run deploy -- up
npm run deploy -- verify
npm run deploy -- check-role
node --import tsx scripts/release-smoke.ts login .local/container-check-session.json
bash scripts/deploy.sh fingerprint > .local/before.txt
# Seed twice must leave the original fictional history unchanged.
npm run deploy -- seed-demo
bash scripts/deploy.sh fingerprint > .local/seeded-again.txt
diff .local/before.txt .local/seeded-again.txt
backup=$(bash scripts/deploy.sh backup)
bash scripts/deploy.sh restore "$backup" ims_restore_ci
IMS_DATABASE=ims_restore_ci bash scripts/deploy.sh fingerprint > .local/restored.txt
diff .local/before.txt .local/restored.txt
npm run deploy -- restart
node --import tsx scripts/release-smoke.ts resume .local/container-check-session.json
# Switch only the isolated CI app to the restored database and verify it through HTTP.
npm run deploy -- activate ims_restore_ci
node --import tsx scripts/release-smoke.ts login .local/restored-session.json
docker run --rm cloudflare/cloudflared:2026.9.1 version
echo 'Container build, persistent restart, and isolated backup restore passed.'
