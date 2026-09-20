# Project walkthrough for interviews

This is a guide to the implemented behavior, not a claim that the learner has already mastered it. Personal explanations and exercises remain in the private `questions.md`.

## Opening description

Uba Inventory is a TypeScript inventory application for two fictional shops and a warehouse. It has a shared product catalog, location-specific stock, purchasing, transfers, and reports. React sends JSON requests to Express, and PostgreSQL enforces relationships and commits inventory changes atomically. The repository records an AI-assisted rebuild with real incremental milestones and tests.

## Five-minute demonstration

Start with the catalog and show that quantity is absent from the product definition. Open Stock, change locations, and show that the same product has a different balance and reorder point. Then open History to connect a current balance to opening stock, sales, adjustments, purchases, and transfers.

Open a partially received purchase: the ordered and received quantities explain what remains outstanding. Open an in-transit transfer: stock has left its source but has not arrived at its destination. Finish on reports, showing how on-hand valuation differs from movement totals and why the date window uses Lagos midnight.

The public demo is read-only. Demonstrate actual writes in a private local installation with an operational account. Keep operational credentials out of a recording or screen share.

## Code paths worth knowing

| Behavior | Start here | Main design choice |
| --- | --- | --- |
| Login and cookies | `apps/api/src/auth.ts` | Server-side session, CSRF token, live role/store lookup |
| Product input | `packages/contracts/src/index.ts`, `catalog-routes.ts` | Runtime validation and decimal strings |
| Sale and rollback | `stock-service.ts`, `stock-repository.ts`, `database.ts` | One connection/transaction for balance, movement, request ID |
| Partial receipt | `purchase-service.ts` | Order lock and all-line atomicity |
| Stock in transit | `transfer-service.ts` | Separate dispatch and receipt actions/permissions |
| Report totals | `report-repository.ts` | SQL arithmetic, one statement snapshot, explicit date zone |
| Recovery | `scripts/deploy.sh`, `deploy/grants.sql` | Restore into a fresh database, verify, then activate |

API source paths in the table are under `apps/api/src/` unless otherwise specified.

## Evidence and limitations

Tests exercise real PostgreSQL concurrency, over-receipt, duplicate requests, failed second-line writes, permissions, ledger equality, exact decimals, and date boundaries. Browser journeys cover the main workflows and failure recovery. The container CI job tests the release artifact, durable sessions, backup restoration, row/sequence equality, and the application against the restored data.

The system does not implement payments, tills, POS integration, CSV import, stock reservations, partial transfer receipts, lost-in-transit recovery, weighted-average costing, returns, or account-management screens. It runs as one server with in-memory login throttling. Reporting is a current inventory estimate, not a full accounting system. Deployment instructions exist, but a public demo is only live after the real Mac mini and hostname checks are completed.

## Development experience to discuss honestly

The learner identified a mismatch between the health-response schema and server fields, and correctly chose product/store records for quantities. Later implementation proceeded while learning tasks accumulated because of time constraints. The lesson notes record actual implementation bugs, including ambiguous browser-test selectors. Present AI assistance and personal contributions accurately, and use the exercises to build understanding before claiming ownership of a design explanation.
