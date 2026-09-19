# Lesson 3: who is asking, and what may they do?

All exercises and questions are in the private local `questions.md`. The implementation works independently of those learning checkpoints.

## Data model

The new migration adds `stores`, `users`, and `web_sessions`. Stores represent two fictional shops and one warehouse. Users hold a bcrypt password hash, role, active flag, and optional store assignment. A database constraint requires MANAGER and STAFF to have an assigned store, while ADMIN and VIEWER span all locations.

`web_sessions` follows the storage format required by `connect-pg-simple`. The browser receives an opaque, signed session ID in an HttpOnly cookie. Identity and CSRF data stay in the database session. There is no JWT or browser localStorage token. [Express sessions](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL session store](https://github.com/voxpelli/node-connect-pg-simple)

## Follow a login

```mermaid
sequenceDiagram
    participant UI as Browser
    participant API as Express
    participant DB as PostgreSQL
    UI->>API: GET /api/auth/session
    API->>DB: Create anonymous session with CSRF token
    API-->>UI: Session cookie + user null + CSRF token
    UI->>API: POST /api/auth/login + credentials + CSRF header
    API->>API: Rate limit, validate CSRF and input
    API->>DB: Read account by normalized email
    API->>API: Compare password using bcrypt
    API->>DB: Replace session ID; store user ID and new CSRF token
    API-->>UI: New cookie + public user fields
    UI->>API: GET /api/products + cookie
    API->>DB: Restore session; reload current account permissions
    API-->>UI: Authorized catalog response
```

Login replaces the anonymous session ID to prevent session fixation. Passwords are compared with bcrypt; a dummy hash is checked for unknown accounts to avoid skipping the expensive comparison. Unknown users, inactive accounts, and incorrect passwords receive the same 401 response. Only public user fields cross the API.

Logout destroys the database session and clears the cookie. An old cookie then fails authorization. Active status, role, and store assignment are read from `users` on each protected request, so changing those fields takes effect without waiting for session expiry.

## Authentication and authorization

`auth.ts` handles sessions, login/logout, CSRF validation, and authorization helpers. `app.ts` protects catalog and store route prefixes. Catalog writes also call `requireAdmin` inside the actual routes. `store-routes.ts` filters lists by the current user's store and checks the requested record before returning one store.

| Operation | ADMIN | MANAGER / STAFF | VIEWER |
| --- | --- | --- | --- |
| Read shared catalog | Yes | Yes | Yes |
| Change shared catalog | Yes | No | No |
| Read locations | All | Assigned store | All |
| Operational stock actions | Milestone 4 | Later role-specific rules | Never write |

The React UI adapts to roles, but server checks remain the authority. Browser tests submit a write directly as a viewer even though no edit button is shown. API tests attempt another store's ID and confirm rejection.

## CSRF, cookies, and throttling

Browsers send cookies automatically. A random session-bound CSRF token adds proof that a write originated from a client that can read this application's session response. Every modifying request, including login and logout, checks `x-csrf-token`. The client fetches the current token before a write so another tab's sign-in change does not leave an old token. Missing or mismatched tokens return 403. Comparison checks UTF-8 byte lengths before a timing-safe comparison.

Cookies are HttpOnly, SameSite=Lax, and Secure by default. Local HTTP explicitly sets `COOKIE_SECURE=false`; HTTPS deployment must enable it and configure proxy trust for the real network boundary. Sessions expire after eight hours of inactivity and survive server restarts through PostgreSQL.

The login route allows ten failed attempts per IP per fifteen minutes, returning HTTP 429 and Retry-After once blocked. Successful logins do not consume the failure allowance. The in-memory limiter resets on restart and is not shared between replicas. [Rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration)

## Setup and verification

`setup:local` creates missing private configuration in the ignored `.env`, without printing secrets or overwriting values. `db:seed:users` hashes configured passwords at bcrypt cost 12 and inserts missing accounts. It does not reset existing passwords. Test accounts use separate credentials and a lower bcrypt cost to keep tests fast; their helper refuses databases without the `_test` suffix.

Supertest checks unauthenticated access, non-admin catalog writes, cross-store reads, CSRF, credentials, throttling, secure cookies, live permission changes, logout, and persistence across application instances. Authentication tests use the real PostgreSQL session store. Catalog tests use an in-memory session store while rolling back their SQL connection; browser tests run the production server with PostgreSQL sessions.

Actual implementation issues:

- Making authentication required exposed unauthenticated catalog tests. They now log in as a test administrator and send a real CSRF token; separate tests verify denied roles.
- Reusing a session store across many independent test applications accumulated event listeners. Each test application now owns its store instance and closes it afterward.
- A browser assertion matched both a success notification and a loading status. It now selects the intended notification by content instead of assuming only one status region.

Public registration, password recovery, account administration, and a hosted demo are outside this increment. The next feature introduces product/store balances together with movement history.
