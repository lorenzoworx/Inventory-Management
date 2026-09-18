# Rebuild roadmap

The first session ended at milestone 1. On 2026-09-18 the owner requested continued implementation because of time constraints. Continue in tested, reviewable increments and collect all learner questions and tasks in [questions.md](../questions.md). Learning checkpoints remain available for later study and do not gate the build.

| Milestone | Deliverable | Learning checkpoint |
| --- | --- | --- |
| 0 | Feature map, relationship diagram, stock-change walkthrough | Explain product vs balance vs movement. |
| 1 | React → Express connection check with loading, error, and retry states | Trace a request and complete the response-message exercise. |
| 2 | Products/categories, search, deactivation, PostgreSQL migrations and seeds | Explain keys, constraints, joins, validation, and parameterized SQL. |
| 3 | Login, sessions, store access, and role checks | Explain authentication versus authorization and test record-level access. |
| 4 | Opening balances, sales, adjustments, reorder settings, movement history | Demonstrate no overselling, transaction rollback, and ledger equality. |
| 5 | Suppliers and purchase orders with partial receiving | Explain lifecycle transitions, locking, and duplicate-submit protection. |
| 6 | Inter-store creation, dispatch, and receipt | Explain in-transit stock and source/destination authorization. |
| 7 | Valuation, low-stock reports, 14-day movement totals, accessible UI | Reconcile reports with hand-calculated fixtures. |
| 8 | Portfolio documentation and read-only public demo | Explain deployment, logs, migration, backup, and restore. |

## Agreed defaults for later milestones

- React, TypeScript, React Router, ordinary CSS, and fetch. Express API. PostgreSQL 18 through pg. Handwritten SQL migrations using node-pg-migrate.
- API endpoints under `/api` for authentication, catalog, stores, suppliers, stock, movements, orders, transfers, and reports. Explicit order/receive/dispatch/cancel operations, Zod request validation, consistent JSON errors, and bounded pagination.
- ADMIN manages all stores and shared catalog/suppliers. MANAGER manages operational work at their assigned store. STAFF records sales, receives purchases, and dispatches/receives transfers for their store. VIEWER reads all stores. Every request checks access to the actual record.
- Password hashing with bcrypt and server-side sessions through express-session with a PostgreSQL session store. Secure cookies, CSRF protection, throttled login, and logout.
- Fictional data for two shops and one warehouse; NGN currency; Africa/Lagos reporting dates; decimal prices transmitted as strings.
- Introduce tables in feature migrations. Preserve the reference project; no old database migration is required.
- Purchase states: DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED; full receipt may skip partial. Cancel only DRAFT or ORDERED orders with no receipts.
- Transfer states: PENDING → IN_TRANSIT → RECEIVED. Only PENDING transfers can be cancelled. Reject same-store transfers and duplicate product lines.
- Append-only movement history; nonzero signed integer quantities; conditional decrements; one database connection per transaction; document locks; idempotent stock-affecting operations using request IDs; database sequences for document numbering.
- Unit tests with Vitest when business rules arrive; API integration tests with Supertest and a separate PostgreSQL test database; browser journeys with Playwright. Cover unauthorized/cross-store access, duplicate SKUs, concurrent sales, repeated/concurrent receiving, invalid transitions, rollback, and reporting totals.

## Publication target

GitHub: https://github.com/lorenzoworx/Inventory-Management. GitHub Actions verifies changes. Manually deploy tested commits initially.

Run application and PostgreSQL containers on the owner's existing macOS Mac mini container runtime. Use persistent database storage, restart policies, and Cloudflare Tunnel for HTTPS application access. The public account is a read-only viewer; operational credentials stay private. Obtain the server connection details and domain at the deployment lesson; neither is required to learn locally.

Provide migration, seed, ledger verification, backup, restore, and deployment commands. Verify database restore and service restart before publishing. Keep secrets outside the repository and use only fictional data.

## Deferred beyond the first release

CSV ingestion, shadow stores, till reconciliation, advanced chain analytics, POS integration, lot/expiry tracking, and multi-currency support.
