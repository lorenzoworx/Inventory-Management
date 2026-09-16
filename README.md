# Uba Inventory

A full-stack inventory management project being rebuilt in small, explainable milestones from an earlier AI-assisted prototype. This repository records the new implementation and the learning behind it.

**Current implementation: milestone 1 — browser → server → browser.** React calls a real Express endpoint, validates its JSON response, and displays loading, success, error, and retry states. Inventory features and public deployment are planned; they are not implemented yet.

## Run locally

Use Node.js 24 and npm. No database, accounts, or environment secrets are needed for this milestone.

```sh
git clone https://github.com/lorenzoworx/Inventory-Management.git
cd Inventory-Management
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite serves React on port 5173 and forwards `/api` requests to Express on port 4000. Both bind to the local machine. Stop them with Ctrl+C.

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

The response is HTTP 200 with JSON containing `status`, `service`, and `checkedAt`. This is an API process check, not a database readiness check. Unknown `/api` routes return a JSON 404.

## Checks

```sh
npx playwright install chromium  # once per machine / browser version
npm run check                    # lint, typecheck, build, browser tests
```

Browser tests run the production app on port 4199, independent of the dev server. They cover the real request path, refresh, pending requests, network errors, HTTP errors, invalid responses, timeout recovery, API 404s, and a phone-sized keyboard walkthrough. `npm test` builds and runs just these tests. GitHub Actions runs the same checks.

## Repository map

```text
apps/web/            React UI and Vite development server
apps/api/            Express HTTP application and server entry point
packages/contracts/  Shared response schema and TypeScript types
tests/               Browser/API boundary tests using Playwright
docs/                Prototype map, roadmap, decisions, and lessons
```

These are npm workspaces: one install and lockfile manage the packages together. The contracts package builds first because both applications import it. If you change a contract during development, restart `npm run dev` so its compiled output is refreshed.

## Learn and continue

1. Read the [prototype map](docs/prototype-map.md).
2. Work through [lesson 1](docs/lessons/01-request-round-trip.md).
3. Write your own answers in the [learning notes](docs/learning-notes.md).
4. Review the [roadmap](docs/roadmap.md) before starting the next milestone.

The rebuild uses React, TypeScript, Express, and later PostgreSQL with direct SQL. [Architecture decisions](docs/decisions.md) explain the choices. The public demo will eventually run in containers on a Mac mini through Cloudflare Tunnel, with read-only visitor access and fictional data.

## Development approach

This is a guided, AI-assisted rebuild. Changes are developed, tested, reviewed, and committed as working increments. The learner's exercises and explanations are recorded separately from implementation progress.
