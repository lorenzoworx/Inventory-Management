# Architecture decisions

## 001 — Separate React frontend and Express API

The learning goal is to make HTTP and the frontend/backend boundary explicit. Vite runs the frontend during development; Express owns API behavior. Production serves both from Express under one origin. This adds setup compared with the original Next.js app but makes the request path easier to inspect.

## 002 — Introduce one complete feature at a time

Milestone 1 connects the browser to an actual API. It does not contain product placeholders, a database, authentication scaffolding, or unimplemented feature navigation. React Router, pg, migrations, sessions, Vitest, and Supertest will be introduced when their features need them. Existing browser tests validate the built application boundary.

## 003 — Share contracts, keep runtime validation

The first shared package contains one response schema and derived type. The API uses the type while constructing its response; the browser uses the schema to check received JSON. The shared package builds first. Its development tradeoff is that schema edits require rebuilding shared output; restart the root dev command for now.

## 004 — SQL first, starting in milestone 2

Use PostgreSQL 18 and parameterized queries through pg. Define migrations with handwritten SQL managed by node-pg-migrate. The objective is to learn constraints, joins, transactions, and locking directly. Keep money in decimal columns and send decimal strings through the API. Database and deployment setup are not part of the first lesson.

## 005 — Preserve stock history

When stock features arrive, all quantity changes must pass through one transaction that updates the balance and inserts a movement. Conditional updates prevent negative quantities. Workflow locks protect purchase/transfer transitions; request IDs prevent duplicate posting. Corrections append history. These rules are planned, not implemented in milestone 1.

## 006 — Demonstrate real progress

The repository records a guided AI-assisted rebuild with ordinary commits made after verification. Learner exercises remain separate and are not completed on the learner's behalf. Documentation distinguishes a working implementation from a completed learning checkpoint.

## 007 — Learn the catalog in SQL before exposing it through HTTP

Milestone 2a introduces categories and products, a versioned handwritten SQL migration, and repeatable fictional seed data. Integer identity keys make relationships easy to inspect while SKUs remain unique business identifiers. Store balances are a later feature. Money is stored as numeric(12, 2), returned by pg as strings, and will be validated at the HTTP boundary when that boundary is introduced.

The existing local PostgreSQL 18 installation runs an isolated project cluster on loopback port 5433. Development and test databases are separate. The helper is local tooling; it does not configure the future container deployment. Vitest verifies database behavior directly, with rollback after each test. Playwright continues to verify the existing HTTP/browser flow.

## 008 — Continue implementation with a separate learning backlog

On 2026-09-18 the owner requested continued development because of time constraints. All learner questions and tasks are collected in the root questions.md; unanswered exercises no longer gate implementation. Explanations, real bugs, tests, and ordinary commits remain part of the process. A completed feature does not imply a completed learning checkpoint.

## 009 — Complete the catalog boundary before stock workflows

The catalog adds React Router, pg as an API runtime dependency, and Supertest for database-backed HTTP tests. Shared schemas validate request and response shapes. Routes handle HTTP; the repository owns parameterized SQL. There is no business-service abstraction until workflows require one. Listing uses literal substring search, stable ordering, and bounded pagination. Deactivation explicitly sets a boolean instead of toggling it, making repeated requests safe.

Categories and products are shared records. Quantities remain absent until the product/store balance and movement ledger are introduced together. Catalog writes now require ADMIN after the authentication increment below. Public deployment remains a later milestone.

## 010 — Server-side sessions and current database permissions

Use bcrypt (cost 12) for provisioned passwords, express-session for signed opaque cookies, and connect-pg-simple for PostgreSQL persistence. Login rotates the session ID and CSRF token; logout destroys the stored session. The API reloads the active user and role/store assignment on each protected request. Catalog writes require ADMIN; store reads are scoped to the actual record, with global reads for ADMIN and VIEWER.

Writes require a session-bound CSRF header, including login/logout. Cookies are HttpOnly, SameSite=Lax, and Secure unless explicitly disabled for local HTTP. The first login throttle uses an in-memory per-IP limiter for one API process; a shared limiter is needed before deploying multiple replicas. Local credentials are generated into an ignored file and never committed. Account administration and recovery flows are outside this milestone.

## 011 — Couple each stock balance change to a movement in one transaction

The stock feature introduces the business-service layer and a transaction runner. Each transaction reserves one pg connection, claims a request UUID, locks the product/store balance, applies a conditional quantity update, records a movement, and saves the result. Any failure rolls back all writes. Repeated identical UUIDs from the same user replay their result; different payloads or users cannot reuse one.

Opening stock is permitted only before any history. Adjustments preserve history and require a reason. Inactive products with remaining stock remain visible for corrections. Reorder points live on the balance record but do not affect the movement ledger. A read-only verification command compares every balance to its movement total. The application has no movement edit/delete API; deployment database permissions and backups remain release work.

## 012 — Treat each purchase receipt as one stock transaction

Purchase orders preserve the prototype's draft, ordered, partially received, received, and cancelled states. A database sequence assigns numbers. Order lines store agreed decimal costs and ordered/received quantities. Only creation/ordering require active catalog records; an existing delivery can still arrive after deactivation.

Receiving and cancellation lock the actual order record before checking state. Receipts claim a user-bound UUID and process products in a stable order on one connection, using the same stock-writing function as direct stock entries. All lines, balances, movements, status changes, and the request result commit together. Linked movement rows preserve the order-line reference. Replays return the previous receipt result; the browser then reloads the current order.

Draft editing and supplier returns are deferred: cancel and replace an incorrect draft; correct physical stock with an explained adjustment after receipt. No new dependency is introduced for purchasing. Tests use real PostgreSQL concurrency and a deliberate later-line failure to verify complete rollback.
