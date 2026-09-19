# Questions and practice tasks

This is the learning backlog. Since 2026-09-18, implementation continues without waiting for these answers. Check a task only when you have actually completed it. This file records questions for the learner; implementation progress lives in the README and roadmap.

## Already discussed

- You identified the health-response mismatch between the shared schema and `app.ts`.
- You implemented the health-message exercise (commit `ea684fc`).
- You explained that quantity belongs in a record linking a product to a store because stores maintain different books. The catalog therefore has no quantity column.

## 1. Browser → server → browser

- [ ] Use the browser Network panel on `/connection`: record the method, URL, HTTP status, and JSON response for `/api/health`.
- [ ] Explain the path from React's `fetch` through Vite's proxy to Express, then back to React state.
- [ ] Explain what changes when Express serves the production frontend under one origin.
- [ ] Explain why a TypeScript type cannot validate JSON received at runtime, and where Zod does that work.
- [ ] Stop only the API, observe the error and retry behavior, then restart it.
- [ ] Explain the response-message diff in commit `ea684fc`, including why the schema and server needed to agree.
- [ ] Describe what `npm run dev`, `npm run build`, and `npm run check` each do.

## 2. Catalog and SQL

- [ ] Complete the two SELECT exercises in `db/exercises/02-catalog.sql`: active products ordered by selling price, then products joined to category names. See `docs/lessons/02-catalog-database.md`.
- [ ] Explain a primary key, a foreign key, and a unique constraint using the product/category tables.
- [ ] Explain why a SKU is different from the database ID, and why an optional barcode uses NULL instead of an empty string.
- [ ] Explain migrations versus seeds. What happens when each is run twice?
- [ ] Trace creating a product: form → shared schema → HTTP request → Express validation → parameterized SQL → response → UI.
- [ ] Submit a duplicate SKU. Explain the HTTP 409 response and why a database constraint is needed even if the UI checks input.
- [ ] Explain why prices cross the API as decimal strings and are stored as `numeric(12, 2)`.
- [ ] Explain why search input belongs in SQL parameters rather than concatenated SQL text.
- [ ] Explain why list endpoints have a maximum page size and a stable ordering.
- [ ] Deactivate and reactivate a practice product. Explain why preserving its ID will matter for stock history.
- [ ] Navigate directly to an edit URL and refresh. Explain the production server's frontend fallback and why unknown `/api` routes still return JSON 404s.
- [ ] Change a category name and check the product list. Explain why the category name is not copied into every product row.
- [ ] Review `docs/lessons/02-catalog-api.md`, then describe one actual implementation bug and its fix in your own words.

## 3. Login and permissions

- [ ] Trace login from the anonymous session/CSRF request through bcrypt comparison to the new cookie. See `docs/lessons/03-authentication.md`.
- [ ] Explain why the database contains a password hash and the browser receives only an opaque session ID.
- [ ] Sign in as the local viewer, then as the administrator. Explain which screens and actions change.
- [ ] Explain why hiding an edit button cannot prevent a direct HTTP write; point to the server check that rejects it.
- [ ] Sign in as the manager and explain why Locations contains only Lagos Central.
- [ ] Compare authentication, role authorization, and authorization for a specific store record.
- [ ] Explain why login changes the session ID and logout deletes the stored session.
- [ ] Explain HttpOnly, SameSite, Secure, and the CSRF header. Why is Secure disabled only for local HTTP?
- [ ] Describe how changing a user's role, active flag, or store affects an existing session.
- [ ] Explain the login throttle and why its state resets on API restart.
- [ ] Review the session-persistence test and explain what a new application instance reads from PostgreSQL.
- [ ] Explain why test credentials and helpers refuse the development database.

## 4. Stock and its history

- [ ] Explain the product/store composite primary key using the same SKU at Lagos Central and Ibadan Market.
- [ ] Trace an opening balance, a sale, and an adjustment through `stock-service.ts`, `stock-repository.ts`, and `database.ts`.
- [ ] Explain why `+10 - 3 - 2` must produce both a balance of 5 and three history entries.
- [ ] Review the concurrent-sales test: why can only one sale of 7 succeed when 10 are available?
- [ ] Explain why every statement inside a PostgreSQL transaction must use the same connection.
- [ ] Explain what rolls back when a movement insert fails after the balance update.
- [ ] Explain why a repeated request UUID returns the previous result, and why the same UUID with different input is rejected.
- [ ] Review the browser test that loses a successful HTTP response. Explain how retrying avoids a duplicate opening balance.
- [ ] Explain why a new opening balance is rejected after a product's stock has been sold back down to zero.
- [ ] Run `npm run db:verify-ledger` and explain what it checks. Distinguish the deliberate fault-injection tests from bugs in real data.
- [ ] Explain why an adjustment needs a reason and why movement rows have no edit/delete API.
- [ ] Explain why reorder points are location-specific and changing one does not create a stock movement.
- [ ] Explain the difference between the balance after a historical entry and the latest balance.

## 5. Suppliers and purchasing

- [ ] Trace a draft order through ordering, partial receipt, and completion using `docs/lessons/05-purchasing.md`.
- [ ] Explain why creating a purchase order does not increase stock.
- [ ] Explain why quantity received belongs to an order line while on-hand quantity belongs to a product/store balance.
- [ ] Order 10 units, receive 4, then receive 6. Explain each counter and movement.
- [ ] Explain why cancellation is rejected after any receipt, even if most units are outstanding.
- [ ] Read the concurrent-receipt test and explain what the order row lock protects.
- [ ] Explain what happens when cancellation and receiving arrive at the same time.
- [ ] Explain why each receipt line calls the stock helper on the existing transaction connection.
- [ ] Review the forced second-line failure test and list every write that rolls back.
- [ ] Explain why replaying an earlier partial receipt returns its original result even after the order is fully received.
- [ ] Explain why product IDs are sorted before locking multiple balances.
- [ ] Explain why order numbers use a sequence and why gaps are valid.
- [ ] Explain why the agreed unit cost remains unchanged when the catalog cost changes.
- [ ] Compare supplier deactivation with deleting supplier history.
- [ ] Explain why an existing delivery can be received after product/supplier deactivation.
- [ ] Inspect a purchase request in the browser and identify the server checks that prevent a staff member receiving another store's order.
- [ ] Explain why pagination buttons inside a form need `type="button"`.

## Later learning checkpoints

- [ ] Authentication: distinguish identity, role permissions, and access to a particular store record. Explain why hidden buttons cannot enforce permissions.
- [ ] Sessions: trace login, cookies, session storage, CSRF protection, and logout.
- [ ] Stock: sketch the product/store balance record and explain its unique product/store pair.
- [ ] Stock: explain how two simultaneous sales of 7 units behave when only 10 are available.
- [ ] Stock: explain why a failed transaction must leave both the balance and movement history unchanged.
- [ ] Purchasing: trace a partial receipt and explain cancellation, locking, and duplicate-request rules.
- [ ] Transfers: explain source dispatch, stock in transit, destination receipt, and the permissions required at each stage.
- [ ] Reports: hand-calculate small fixtures and compare them with SQL totals; explain Africa/Lagos date boundaries.
- [ ] Release: explain migrations, container restart policies, logs, backups, and the restore test.

## Deployment details to supply when deployment begins

- [ ] Record how to connect to the Mac mini and which container runtime it uses. Keep credentials outside this repository.
- [ ] Choose the domain/subdomain for the public demo and confirm it is configured in Cloudflare.
- [ ] Keep operational login credentials private; publish only the read-only viewer account once authorization is implemented and tested.

## Your notes

Write your own explanations, surprises, and follow-up questions here or in `docs/learning-notes.md`. Unchecked items do not mean the implementation is missing.
