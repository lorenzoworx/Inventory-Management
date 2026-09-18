# Uba Inventory

A full-stack inventory management project being rebuilt in small, explainable milestones from an earlier AI-assisted prototype. This repository records the new implementation and the learning behind it.

**Current implementation: milestone 2 — a working product catalog.** Create and edit products and categories, search by name/SKU/barcode, filter by category/status, paginate, and deactivate/reactivate products. The React screens use the Express API and PostgreSQL. Authentication, store balances, purchasing, transfers, reports, and public deployment are still planned.

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

For a database hosted elsewhere, create separate development and test databases, set their URLs in `.env`, and skip `db:start`. The server requires DATABASE_URL. The health endpoint checks the API process; catalog operations also require a reachable, migrated database.

To test the production arrangement, stop development first, then:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4000. Express now serves the compiled frontend and the API from the same origin. React Router handles `/products`, `/products/new`, `/products/:id/edit`, `/categories`, and the original `/connection` lesson. Express serves those routes correctly on refresh. `PORT` and `HOST` can configure this production server; keep the defaults for local use.

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

Vitest applies migrations and seeds to `TEST_DATABASE_URL`, which must name a separate database ending in `_test`. Database and Supertest API tests roll back their changes. They cover joins, decimal strings, invalid requests, duplicate identifiers, category renames, filtering/pagination, malformed JSON, deactivation, and migration/seed repeatability. Run them with `npm run test:db`.

Playwright runs the production app on port 4199, independent of the dev server. It also uses TEST_DATABASE_URL, applies migrations/seeds before the tests, and cleans up the catalog records its journeys create. Tests cover catalog creation/editing, activation changes, validation, filters, pagination, direct-link refresh, recovery from failures, phone layouts, keyboard access, and the original connection lesson. Run them with `npm run test:e2e`. `npm test` runs both suites; GitHub Actions does the same against a PostgreSQL 18 service.

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

All questions and practice tasks are collected in [questions.md](questions.md). Unanswered exercises do not pause implementation. The [prototype map](docs/prototype-map.md), [HTTP lesson](docs/lessons/01-request-round-trip.md), [SQL lesson](docs/lessons/02-catalog-database.md), and [catalog request walkthrough](docs/lessons/02-catalog-api.md) explain the code. Keep personal explanations in [learning notes](docs/learning-notes.md); see the [roadmap](docs/roadmap.md) for remaining features.

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

Validation errors use HTTP 400, duplicate identifiers 409, missing records 404, oversized JSON bodies 413, and unexpected failures 500. Error bodies use `{ "error": { "code": "…", "message": "…", "fields": { "sku": "…" } } }`; `fields` is optional. The current local catalog has no login yet. Public hosting waits for the planned authentication and read-only viewer role.
