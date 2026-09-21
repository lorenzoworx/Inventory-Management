# Deployment and recovery

The application is deployed on the owner's Mac mini at [the public demo](https://boywithabot.com/projects/inventory-management/login). External HTTPS/viewer checks passed on 2026-09-21 UTC; see the [verification record](release-verification.md). GitHub CI has passed the container build, restore, and restart checks on Linux; host reboot behavior and off-machine recovery remain separate verification steps.

The live site uses `/projects/inventory-management/`. The generic Compose instructions below describe a direct origin at `/`; preserve and record the host's subpath configuration before replacing the deployed build. This checkout's frontend currently defaults to root-relative routes and API URLs.

## First installation

Use a tested Git commit, Node.js 24/npm for setup, and an existing Docker-compatible runtime with Docker Compose v2. The runtime must start when the Mac mini starts; a Compose restart policy alone cannot start a stopped macOS container runtime. Keep the host awake while serving the demo.

```sh
npm ci
npm run setup:deploy
npm run deploy -- build
npm run deploy -- migrate
npm run deploy -- seed
npm run deploy -- up
npm run deploy -- verify
npm run deploy -- check-role
npm run deploy -- status
```

`setup:deploy` creates `deploy/.env` once with private random secrets and mode 0600. Preserve it; regenerating the session secret signs out existing sessions, and editing database passwords in the file does not rotate passwords already stored in PostgreSQL. Provisioning preserves existing accounts and passwords. Use only the generated URL-safe hex format for database passwords interpolated into connection URLs. Never paste configuration output containing secrets into an issue.

Migrations and seeds run as short-lived maintenance containers with the privileged `ims_owner` account. The running Express container uses `ims_app`, which cannot create tables, edit users, or update/delete movement history. Its operational table privileges allow the normal application to work if demo mode is disabled in a future private deployment. `deploy/grants.sql` runs after every migration and restore; newly introduced tables need an explicit grant.

The seed creates six catalog products, three locations, and two fictional suppliers. The optional demo step creates opening stock, 13 days of sales, an adjustment, completed/partial purchases, and received/in-transit/pending transfers using the business services. The whole demo seed is one transaction. It refuses an existing inventory without its completion marker; repeating a completed seed does nothing. Historical dates are assigned only while creating these initial fictional fixtures. They do not advance automatically as the demo ages.

The PostgreSQL 18 volume is mounted at `/var/lib/postgresql`, following the image's [version-specific data layout](https://hub.docker.com/_/postgres). No database or application host port is published by the default Compose file. Application and database containers restart unless explicitly stopped. Logs rotate at 10 MB with three files per service.

## Inspect locally before connecting the tunnel

```sh
IMS_LOCAL_HTTP=1 npm run deploy -- up
IMS_BASE_URL=http://127.0.0.1:4200 node --import tsx scripts/release-smoke.ts login
IMS_LOCAL_HTTP=1 npm run deploy -- restart
IMS_BASE_URL=http://127.0.0.1:4200 node --import tsx scripts/release-smoke.ts resume
```

The optional override publishes only `127.0.0.1:4200` and temporarily disables Secure cookies for HTTP. Open that URL to browse. Do not combine this override with a public tunnel. The smoke command stores a viewer session under the ignored `.local` directory; `resume` checks that both the app and database can restart without losing the session or business data.

Public demo credentials are intentionally published:

- Email: `viewer@uba.example`
- Password: `Explore-Uba-Inventory`

`PUBLIC_DEMO=true` enables the demo button, rejects operational logins, and blocks all business writes on the server, even if an administrator cookie was issued earlier. Login/logout still work. Development continues to use private passwords and full role-based operations.

## Connect the public hostname

Create a named, remotely managed tunnel in the owner's Cloudflare account, with the chosen public hostname routed to `http://127.0.0.1:4000`. Require HTTPS at the edge. Store its token in the ignored `.local/secrets/tunnel-token` file, outside Git. Create `.local/secrets` with mode 0700 so only its owner can access the directory. Give the token file mode 0444 so the non-root cloudflared process can read the individual file mounted inside its container; the private parent directory protects it on the host. Do not put the token on a command line or in documentation.

```sh
# IMS_LOCAL_HTTP must be unset for the public deployment.
npm run deploy -- tunnel
```

The pinned cloudflared container shares the app container's network namespace. It connects to Express from loopback; only loopback is trusted for forwarded protocol/client-IP headers. Express therefore recognizes HTTPS and issues Secure cookies without trusting arbitrary container peers. The origin has no public port. This follows Express's [explicit proxy trust guidance](https://expressjs.com/en/guide/behind-proxies/) and Cloudflare's [token-file configuration](https://developers.cloudflare.com/tunnel/reference/run-parameters/#token-file).

The tunnel command recreates both app and connector so the connector cannot remain attached to an old network namespace after an app replacement. Run it after upgrades or switching databases. It intentionally causes a brief interruption. A normal container restart retains its namespace.

After routing the hostname, verify HTTPS login, a Secure/HttpOnly/SameSite=Lax session cookie, logout, a forbidden write, and a refresh on `/reports/valuation` through the real public URL. Confirm only viewer credentials are shown. Check tunnel status in Cloudflare. Record these results against the actual public URL; deployment completion alone does not establish that each check passed.

## Back up and restore safely

```sh
npm run deploy -- backup
# Use the exact .local/backups/...dump path printed above.
npm run deploy -- restore .local/backups/YOUR_BACKUP.dump ims_restore_20260920
```

Backups use PostgreSQL's custom archive format. They include schema, business data, request IDs, and sequence positions. Session rows are deliberately excluded so a restored database signs everyone out. Files are private and ignored; they contain password hashes and must not be published. Copy backups and the separate deployment configuration to private storage outside this machine. A copy beside the database is useful for testing but cannot recover a lost Mac mini. Take backups before every deployment and regularly while the demo changes; test recovery periodically.

Restore always creates a **new** database with an `ims_restore_` name. It refuses an existing target and never drops or cleans the running database. PostgreSQL [restores the archive in one transaction](https://www.postgresql.org/docs/18/app-pgrestore.html); errors stop the process. Grants and ledger verification run against the restored database. A failed restore leaves an isolated database for investigation and does not switch the application.

On a quiescent, read-only demo, compare the source and restored business rows plus sequence positions:

```sh
bash scripts/deploy.sh fingerprint > .local/source.txt
IMS_DATABASE=ims_restore_20260920 bash scripts/deploy.sh fingerprint > .local/restored.txt
diff .local/source.txt .local/restored.txt
```

The fingerprint is intended for this small demo and excludes expiring sessions. Compare the source before the backup if writers are enabled; later writes legitimately change the source fingerprint. Review the successful restore and verification before switching:

```sh
npm run deploy -- activate ims_restore_20260920
npm run deploy -- tunnel
```

`activate` persists the selected database name in the ignored `deploy/database` file. Future backup, migration, and verification commands use that selection. The old database remains available. `activate ims` switches back to the original if appropriate; it does not merge data or reverse migrations. Existing restore-test databases are not automatically deleted.

## Deploy another tested commit

Record the current Git commit and active database. Back up first. Fetch the repository and check out the exact commit whose **check** and **container** CI jobs passed. Then run build, migrate, up, verify, check-role, and tunnel. Do not reseed an established inventory. Keep the deployment commit recorded in host operations notes.

Migrations are forward-only in this runbook. Rolling back application code is only safe if it remains compatible with the database. For an incompatible change, restore the pre-deployment backup into a fresh database and activate it with matching code. No automatic update job or destructive rollback command is installed.

## Health, logs, and limitations

- `/api/health`: the process can serve HTTP. `/api/ready`: the database is reachable and the catalog table exists. Neither replaces the ledger check.
- `npm run deploy -- logs`: the last 100 app/database log lines. Unexpected request errors are logged; credentials, cookies, request bodies, and tunnel debug headers should not be collected.
- `npm run deploy -- verify`: every stored balance must equal its movement sum.
- `npm run check:container`: CI-owned isolated Compose stack, repeated seed, viewer smoke, runtime grants, custom-format backup, row/sequence comparison after restore, persistent-session restart, and HTTP reads from the restored database.

CI tests Linux amd64. The Node/PostgreSQL/cloudflared base images also support arm64, but the actual Mac mini runtime, mount permissions, host reboot behavior, tunnel, and external backup location still require host verification. Single-instance in-memory login throttling resets on app restart. There is no automated off-machine backup scheduler, high availability, or production monitoring service in this portfolio release.
