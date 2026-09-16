# Uba Inventory

A full-stack inventory management project being rebuilt in small, explainable milestones from an earlier AI-assisted prototype. This repository records the new implementation and the learning behind it.

**Current implementation: milestone 2a — the catalog database.** The React/Express connection check works, and PostgreSQL now has a product/category migration and fictional seed data. Catalog API routes, catalog screens, stock operations, and public deployment are still planned.

## Run locally

Use Node.js 24, npm, and PostgreSQL 18. The PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`, and `createdb`) must be on PATH.

```sh
git clone https://github.com/lorenzoworx/Inventory-Management.git
cd Inventory-Management
npm ci
cp .env.example .env
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://127.0.0.1:5173. Vite serves React on port 5173 and forwards `/api` requests to Express on port 4000. Both bind to the local machine. Stop them with Ctrl+C.

The local database helper creates its own cluster under the ignored `.local/postgres` directory and listens on `127.0.0.1:5433`. It creates `ims` for development and `ims_test` for tests. It uses trust authentication for local learning only; the later server deployment will use separate credentials and configuration. Existing PostgreSQL services are not reconfigured.

`npm run db:shell` opens psql for the development database. `npm run db:stop` stops this project's cluster while preserving its data; `db:start` starts it again. These helpers always target the local cluster, while migration and seed commands use `DATABASE_URL` from the environment or `.env`.

For a database hosted elsewhere, create separate development and test databases, set their URLs in `.env`, and skip `db:start`. The connection-check webpage can still run without PostgreSQL; it does not query the catalog yet.

To test the production arrangement, stop development first, then:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4000. Express now serves the compiled frontend and the API from the same origin. Only `/` is a frontend page at this stage; client-side routing comes with the catalog. `PORT` and `HOST` can configure this production server; keep the defaults for local use.

## Explore the request

```sh
curl -i http://127.0.0.1:4000/api/health
```

The response is HTTP 200 with JSON containing `status`, `service`, `checkedAt`, and `message`. The page displays the message supplied by Express. This is an API process check, not a database readiness check. Unknown `/api` routes return a JSON 404.

## Checks

```sh
npx playwright install chromium  # once per machine / browser version
npm run check                    # lint, typecheck, database tests, build, browser tests
```

Vitest applies the migration and seed to `TEST_DATABASE_URL`, which must name a separate database ending in `_test`. Constraint tests roll back their changes. They cover category relationships, decimal prices, invalid records, migration/seed repeatability, and deactivation. Run them with `npm run test:db`.

Playwright runs the production app on port 4199, independent of the dev server. Browser tests cover the real request path, refresh, pending requests, network errors, HTTP errors, invalid responses, timeout recovery, API 404s, and a phone-sized keyboard walkthrough. Run them with `npm run test:e2e`. `npm test` runs both suites; GitHub Actions does the same against a PostgreSQL 18 service.

## Repository map

```text
apps/web/            React UI and Vite development server
apps/api/            Express HTTP application and server entry point
packages/contracts/  Shared response schema and TypeScript types
db/                  Handwritten migrations, fictional seed data, SQL exercise
scripts/             Local database lifecycle and migration/seed commands
tests/               Database checks with Vitest; browser checks with Playwright
docs/                Prototype map, roadmap, decisions, and lessons
```

These are npm workspaces: one install and lockfile manage the packages together. The contracts package builds first because both applications import it. If you change a contract during development, restart `npm run dev` so its compiled output is refreshed.

## Learn and continue

1. Read the [prototype map](docs/prototype-map.md).
2. Work through [lesson 1](docs/lessons/01-request-round-trip.md).
3. Write your own answers in the [learning notes](docs/learning-notes.md).
4. Continue with [lesson 2a: the catalog database](docs/lessons/02-catalog-database.md).
5. Review the [roadmap](docs/roadmap.md) before starting the next milestone.

The rebuild uses React, TypeScript, Express, and PostgreSQL with direct SQL. [Architecture decisions](docs/decisions.md) explain the choices. The public demo will eventually run in containers on a Mac mini through Cloudflare Tunnel, with read-only visitor access and fictional data.

## Development approach

This is a guided, AI-assisted rebuild. Changes are developed, tested, reviewed, and committed as working increments. The learner's exercises and explanations are recorded separately from implementation progress.
