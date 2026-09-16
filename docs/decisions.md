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
