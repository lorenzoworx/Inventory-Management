# Public demo verification

Live demo: [Uba Inventory](https://boywithabot.com/projects/inventory-management/login).

The owner confirmed Mac mini deployment. An external Chromium browser verified the public application on **2026-09-21 UTC**, using only the published viewer account.

| Check | Result |
| --- | --- |
| HTTPS readiness and demo configuration | Ready; public-demo mode enabled |
| Explore read-only demo button | Signed in as VIEWER |
| Location access | All three fictional locations available |
| Session cookie | Secure, HttpOnly, SameSite=Lax |
| Valuation, low stock, movement totals | Loaded and survived direct page refresh |
| Stock, history, purchases, transfers | Loaded and survived direct page refresh |
| Empty category write probe | Rejected with 403 DEMO_READ_ONLY; no record created |
| Logout | Subsequent protected product request returned 401 |
| Phone layout at 390 px | No viewport overflow; wide table scrolls within its region |
| Application JavaScript | No uncaught page errors |

Desktop movement charts and the phone report were also inspected visually. The live site uses the `/projects/inventory-management/` prefix, including its API and static assets. This verification exercised that full public path.

The site's Content Security Policy blocks Cloudflare's analytics beacon at `static.cloudflareinsights.com`. This generated a browser console warning but did not prevent application use. The host's analytics/CSP configuration can be reconciled separately.

## Verification boundaries

The [release preparation CI run](https://github.com/lorenzoworx/Inventory-Management/actions/runs/35537064931) passed 131 database/API tests, 39 browser tests, and container checks for runtime grants, repeatable demo seeding, backup restoration, business-row/sequence equality, and durable sessions after restarting the application and database.

Those CI results concern repository commit `69080cd`. Public checks establish the behavior observed at the deployed URL; they do not independently identify its source revision. The exact deployed commit and host subpath configuration still need to be recorded before reproducing or replacing that deployment from this checkout. The checked-in frontend currently defaults to root-relative routes and API URLs.

This session did not reboot the Mac mini, inspect its private configuration, or test recovery from an off-machine backup. These host checks and the learner's exercises remain in the private `questions.md`.
