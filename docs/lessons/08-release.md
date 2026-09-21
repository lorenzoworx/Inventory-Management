# Release: make the working app repeatable

The release adds an explicit public-demo mode, guarded fictional workflow seeds, browser security headers, a database readiness endpoint, Docker builds, persistent PostgreSQL storage, and commands for deployment and recovery. The existing business architecture stays the same.

## Process health and readiness

`/api/health` answers when Express can serve HTTP. `/api/ready` also queries the database. A process can be alive while its database is unavailable; the latter returns 503 without exposing connection details. Docker waits for database/app health, while ledger verification separately checks inventory correctness.

## Build once, run with fewer privileges

The Docker build installs the locked dependencies and builds contracts, API, and frontend. The runtime stage includes only production dependencies and compiled output, runs as a non-root user, and uses a read-only filesystem with a temporary directory. A separate maintenance image retains TypeScript/migration tooling for commands that need it.

Maintenance connects as the database owner. The running application connects as `ims_app` with explicit table grants. Denying UPDATE/DELETE on movement history supports the same rule enforced by the API. This is not protection from a database owner, who can restore or repair data.

PostgreSQL files live in a named volume, not the disposable container layer. Replacing an application container therefore preserves records and sessions. Keeping the same session secret is also necessary for existing cookies to remain valid.

## Public demo and seeds

The visitor password is intentionally public. Operational passwords are generated privately and never sent to the frontend. Public-demo mode accepts only viewer logins and rejects business writes independently of role checks. This also rejects writes using an older administrator cookie.

The demo seed uses the actual stock, purchasing, and transfer services within one transaction. An advisory lock serializes two seed attempts, and a fixed request marker makes reruns harmless. It refuses an existing ledger. Fixture timestamps are assigned once during the initial seed so the report has recent history. The fixture tests verify both balance totals and the chronological running balance of each product/store pair.

## Backup is only half of recovery

The backup command creates a private PostgreSQL custom-format archive and excludes sessions. Restore creates a new named database, imports in one transaction, reapplies runtime grants, and verifies ledger equality. It never replaces the running database automatically.

CI compares business rows and sequence positions, then points its isolated application at the restored database and signs in again. A separate restart check reuses a cookie from before the restart to prove that the normal PostgreSQL session store survives. Restore intentionally signs users out because session rows were excluded.

## Release boundary

Container checks passed in GitHub CI; initial development ran on a MacBook without a container runtime. The owner subsequently confirmed Mac mini deployment is complete. External HTTPS/viewer checks passed at the [live demo](https://boywithabot.com/projects/inventory-management/login); the [verification record](../release-verification.md) separates those results from CI and host recovery checks. The deployed revision/subpath configuration, host reboot behavior, and off-machine recovery remain private follow-up tasks.

Setup, commands, recovery procedures, and technical sources are in `docs/deployment.md`. The system diagram is in `docs/architecture.md`; the interview guide is in `docs/interview-walkthrough.md`. Questions and exercises remain private in `questions.md`.
