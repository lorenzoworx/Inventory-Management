# Uba Inventory

A full-stack inventory management project being rebuilt in small, explainable milestones from an earlier AI-assisted prototype. This repository records the new implementation and the learning behind it.

**Current implementation: milestone 3 — login and permissions.** The product/category catalog supports creation, editing, search, filters, pagination, and activation changes. Login uses bcrypt and PostgreSQL-backed sessions, with CSRF protection, login throttling, and logout. Catalog writes require ADMIN; managers and staff see their assigned location, while administrators and viewers can browse all three fictional locations. Stock operations, purchasing, transfers, reports, and public deployment are still planned.

## Run locally

Use Node.js 24, npm, and PostgreSQL 18. The PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`, and `createdb`) must be on PATH.

```sh
git clone https://github.com/lorenzoworx/Inventory-Management.git
cd Inventory-Management
npm ci
npm run setup:local
npm run db:start
npm run db:migrate
npm run db:seed
npm run db:seed:users
npm run dev
```

Open http://127.0.0.1:5173 and sign in. Local account details are below. Vite serves React on port 5173 and forwards `/api` requests to Express on port 4000. Both bind to the local machine. Stop them with Ctrl+C.

The local database helper creates its own cluster under the ignored `.local/postgres` directory and listens on `127.0.0.1:5433`. It creates `ims` for development and `ims_test` for tests. It uses trust authentication for local learning only; the later server deployment will use separate credentials and configuration. Existing PostgreSQL services are not reconfigured.

`npm run db:shell` opens psql for the development database. `npm run db:stop` stops this project's cluster while preserving its data; `db:start` starts it again. These helpers always target the local cluster, while migration and seed commands use `DATABASE_URL` from the environment or `.env`.

For a database hosted elsewhere, create separate development and test databases, set their URLs in `.env`, and skip `db:start`. The server requires DATABASE_URL and a SESSION_SECRET of at least 32 characters. The health endpoint checks the API process; catalog operations also require a reachable, migrated database.

To test the production arrangement, stop development first, then:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4000. Express now serves the compiled frontend and the API from the same origin. React Router handles `/products`, `/products/new`, `/products/:id/edit`, `/categories`, `/stores`, `/login`, and the original `/connection` lesson. Express serves those routes correctly on refresh. `PORT` and `HOST` can configure this production server; keep the defaults for local use.

## Explore the request

```sh
curl -i http://127.0.0.1:4000/api/health
```

The response is HTTP 200 with JSON containing `status`, `service`, `checkedAt`, and `message`. The `/connection` page displays the message supplied by Express. This is an API process check, not a database readiness check. Unknown `/api` routes return a JSON 404.

## Checks

```sh
npx playwright install chromium  # once per machine / browser version
npm run check                    # lint, typecheck, database tests, build, browser tests
```

Vitest applies migrations and seeds to `TEST_DATABASE_URL`, which must name a separate database ending in `_test`. Database and Supertest API tests roll back their changes. They cover catalog behavior plus unauthenticated requests, all non-admin catalog writes, cross-store access, live role changes, CSRF checks, login throttling, cookie security, logout, and PostgreSQL session persistence. Catalog SQL changes roll back; the auth suite uses the real PostgreSQL session store and removes its session fixtures. Run them with `npm run test:db`.

Playwright runs the production app on port 4199, independent of the dev server. It also uses TEST_DATABASE_URL, applies migrations/seeds before the tests, and cleans up the catalog records its journeys create. Tests cover login/logout, protected deep links, viewer screens and forbidden writes, assigned-store views, session loss, catalog operations, error recovery, phone layouts, keyboard access, and the original connection lesson. Run them with `npm run test:e2e`. `npm test` runs both suites; GitHub Actions does the same against a PostgreSQL 18 service.

## Repository map

```text
apps/web/            React UI and Vite development server
apps/api/            Express HTTP application and server entry point
packages/contracts/  Shared request/response schemas and TypeScript types
db/                  Handwritten migrations, fictional seed data, SQL exercise
scripts/             Local database lifecycle and migration/seed commands
tests/               Database/API checks with Vitest + Supertest; browser checks with Playwright
docs/                Prototype map, roadmap, decisions, and lessons
```

These are npm workspaces: one install and lockfile manage the packages together. The contracts package builds first because both applications import it. If you change a contract during development, restart `npm run dev` so its compiled output is refreshed.

## Learn alongside the build

All questions and practice tasks are collected in [questions.md](questions.md). Unanswered exercises do not pause implementation. The [prototype map](docs/prototype-map.md), [HTTP lesson](docs/lessons/01-request-round-trip.md), [SQL lesson](docs/lessons/02-catalog-database.md), [catalog walkthrough](docs/lessons/02-catalog-api.md), and [sessions and permissions lesson](docs/lessons/03-authentication.md) explain the code. Keep personal explanations in [learning notes](docs/learning-notes.md); see the [roadmap](docs/roadmap.md) for remaining features.

The rebuild uses React, TypeScript, Express, and PostgreSQL with direct SQL. [Architecture decisions](docs/decisions.md) explain the choices. The public demo will eventually run in containers on a Mac mini through Cloudflare Tunnel, with read-only visitor access and fictional data.

## Development approach

This is a guided, AI-assisted rebuild. Changes are developed, tested, reviewed, and committed as working increments. The learner's exercises and explanations are recorded separately from implementation progress. Since 2026-09-18, development continues while learning questions accumulate for later review.

## Catalog API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /api/products | Search and paginate; active products by default |
| GET | /api/products/:id | Read one product |
| POST | /api/products | Create an active product |
| PUT | /api/products/:id | Replace editable catalog fields |
| PATCH | /api/products/:id/status | Set `isActive` explicitly |
| GET | /api/categories | Paginated category list |
| POST | /api/categories | Create a category |
| PUT | /api/categories/:id | Rename a category |

Product queries accept `q`, `categoryId`, `status=active|inactive|all`, `page`, and `pageSize`. Page size defaults to 20 and is capped at 100; pages are capped at 100,000. Search is a case-insensitive literal substring of name, SKU, or barcode. Lists sort by name and then ID. SKU, barcode, and category-name uniqueness currently remain case-sensitive.

Product bodies contain `sku`, `barcode` (string or null), `name`, `unit`, `costPrice`, `sellPrice`, and numeric `categoryId`. Prices are decimal strings, non-negative, at most two fractional digits and ten integer digits. The API returns prices with two fractional digits. Free products and selling below cost are allowed; stock quantity belongs to a later product/store balance record.

Validation errors use HTTP 400, duplicate identifiers 409, missing records 404, oversized JSON bodies 413, and unexpected failures 500. Error bodies use `{ "error": { "code": "…", "message": "…", "fields": { "sku": "…" } } }`; `fields` is optional. Catalog reads require authentication; all catalog writes require ADMIN and a valid CSRF token. Public hosting remains a later release milestone.

## Local accounts and authentication

`npm run setup:local` creates missing values in the ignored `.env` file, restricts its file permissions, and preserves existing values. It generates random local passwords and a session secret without printing them. `db:seed:users` hashes the passwords with bcrypt (cost 12) and creates only missing accounts. Re-running it does not reset existing passwords or roles.

| Email | Password entry in .env | Access |
| --- | --- | --- |
| admin@uba.example | ADMIN_PASSWORD | Manage shared catalog; read all locations |
| viewer@uba.example | VIEWER_PASSWORD | Read catalog and all locations |
| manager@uba.example | MANAGER_PASSWORD | Read catalog; assigned to Lagos Central |
| staff@uba.example | STAFF_PASSWORD | Read catalog; assigned to Lagos Central |

The other fictional locations are Ibadan Market and Main Warehouse. Operational manager/staff actions arrive with stock, purchasing, and transfers. There is no public registration, password-reset flow, or account-management UI in this milestone. Account passwords must be at least 12 characters and at most 72 UTF-8 bytes when provisioned. Test credentials are separate and can only be seeded into a database ending in `_test`.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /api/auth/session | Current user or null, plus a session-bound CSRF token |
| POST | /api/auth/login | Verify credentials and replace the session ID/token |
| POST | /api/auth/logout | Delete the session and clear its cookie |
| GET | /api/stores | Paginated list restricted to accessible locations |
| GET | /api/stores/:id | Check access to the actual location record |

Writes, including login/logout, require the `x-csrf-token` header. The frontend fetches the current token immediately before a write; cookies travel automatically under the same origin. The session cookie is HttpOnly, SameSite=Lax, and expires after eight hours of inactivity. Identity lives in PostgreSQL, and each protected request reloads the user's current active status, role, and store assignment.

Secure cookies are enabled unless `COOKIE_SECURE=false`. The local helper explicitly disables that flag for loopback HTTP. Deployment must use `COOKIE_SECURE=true` and HTTPS; `TRUST_PROXY=loopback` is available only when a trusted proxy connects from loopback. Configure the actual tunnel/container trust boundary when deploying. Failed logins are limited to ten per IP per fifteen minutes; the limiter is in memory and resets on API restart. Sessions persist across restarts when the secret and PostgreSQL data remain the same.
