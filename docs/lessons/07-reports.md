# Reports: make the numbers explainable

Reports read the existing catalog, balances, and movement history. They add no new business records. The server performs the arithmetic and permission filtering; React renders totals, tables, a daily chart, and loading/error states.

## Stock valuation

The report multiplies each positive on-hand balance by its product's current catalog cost, then sums the results in PostgreSQL. For example:

| Product / location | Quantity | Unit cost | Value |
| --- | ---: | ---: | ---: |
| A / Lagos | 8 | ₦0.10 | ₦0.80 |
| A / Ibadan | 5 | ₦0.10 | ₦0.50 |
| B / Lagos | 4 | ₦20.25 | ₦81.00 |
| Inactive product / Lagos | 2 | ₦999.99 | ₦1,999.98 |
| Total | 19 | | ₦2,082.28 |

Inactive stock still has value, so it is included. Zero quantities contribute nothing and are omitted from the table. Stock in transit is outside both locations' on-hand balances and is excluded until it arrives. A report for Lagos alone totals ₦2,081.78.

This is a current estimate using catalog cost. Editing a catalog cost changes the report; purchase order costs remain their own saved values. Use Refresh report to load current balances and costs without changing the filters. The report does not implement historical valuation, weighted-average costing, taxes, accounting profit, or cost of goods sold. Its UI states the cost basis rather than suggesting that it is a formal accounting valuation.

PostgreSQL does all monetary arithmetic with numeric values. Both row values and totals cross the API as decimal strings. Aggregated quantities also use strings because sums can exceed a JavaScript number's exact integer range. React uses string formatting for money and BigInt for exact count formatting. Only the chart's relative bar widths use Number; its displayed quantities remain exact.

## Low stock

An active product is low at a location when `quantity <= reorder_point`. Equality matters: 8 units at a reorder point of 8 needs attention. Zero quantity is labelled out of stock.

The shared catalog currently applies to every location. The query joins every active product to the accessible locations and then LEFT JOINs balances. Missing balance rows mean zero quantity and a default reorder point of zero, so never-stocked products appear too. There is no per-store assortment feature yet. Inactive products are excluded from reorder attention, even though their remaining stock is still valued.

A reorder point is a trigger, not a recommended purchase quantity. The report does not calculate demand forecasts. Each row links to the corresponding product/store stock view, where an authorized manager can change its reorder point or act on its stock.

## Fourteen Lagos calendar days

The movement report accepts an optional ending date. If omitted, PostgreSQL determines today in Africa/Lagos. The window includes that date and the previous 13 calendar dates.

For an ending date of 2026-09-20, it covers:

- Start: 2026-09-07 00:00 Lagos, equivalent to 2026-09-06 23:00 UTC, inclusive.
- End: 2026-09-21 00:00 Lagos, equivalent to 2026-09-20 23:00 UTC, exclusive.

Using `>= start AND < end` includes every instant in the final day without inventing a last millisecond. PostgreSQL timestamps have finer precision than JavaScript Date, so tests include a record one microsecond before the end and another exactly at the end.

The query converts the civil date boundaries to timestamptz using `AT TIME ZONE 'Africa/Lagos'`. It groups each included timestamp back into its Lagos date. It does not depend on the browser's time zone or the connection's TimeZone setting. PostgreSQL explains these conversions in its [date/time documentation](https://www.postgresql.org/docs/18/functions-datetime.html).

A generated series supplies all 14 dates. A LEFT JOIN and COALESCE give zero totals for days without movements. Opening stock, purchases, sales, positive/negative adjustments, and incoming/outgoing transfers remain separate columns. Units out are positive magnitudes; net change is signed. The daily chart summarizes units in and out, while the table exposes exact values by movement kind.

Across all locations, a transfer contributes an outgoing movement on dispatch day and an incoming movement on arrival day. Those dates can differ. During transit the all-location net quantity temporarily decreases. The movement report records activity; it does not substitute for an in-transit report or calculate sales revenue.

## Keep scope and totals consistent

ADMIN and VIEWER may report across all locations or select one. MANAGER and STAFF default to their assigned store and cannot request another store. Routes check an explicit store ID, and every SQL query filters by the resolved accessible scope. Report endpoints remain read-only.

Search matches a literal, case-insensitive product name or SKU. Valuation and low-stock lists use bounded pagination. Summary totals cover all matching rows rather than only the visible page. Each report is produced by one SQL statement, so its totals and table rows share the same statement snapshot even if a stock transaction commits concurrently. Separate page requests can naturally see later changes.

Common table expressions name the query stages: records, page, dates, daily, and totals. PostgreSQL's [aggregate functions](https://www.postgresql.org/docs/18/functions-aggregate.html) calculate counts and sums. Dynamic parts of the movement expressions come only from fixed source-code definitions; all user values are query parameters. Date-range indexes support all-location and individual-location movement reads.

## Inspect the implementation

- `report-routes.ts`: query validation, current user's store scope, and HTTP responses.
- `report-repository.ts`: joins, decimal arithmetic, date boundaries, aggregates, ordering, and pagination in SQL.
- `packages/contracts/src/index.ts`: request and response schemas, including exact string totals and 14 daily rows.
- `ReportsPage.tsx`: filter URLs, report navigation, metric cards, daily bars, accessible table regions, and retry/empty states.
- `tests/report-fixtures.ts`: deterministic products and stock entries created on the test database through the stock service. Only test timestamps are moved to precise historical boundaries.

## Verification and actual implementation notes

Fixtures test the arithmetic above, a valuation beyond JavaScript's exact integer range, stock at the reorder threshold, unstocked and inactive products, whole-result totals on paginated and empty pages, literal search input, permissions, leap day, default Lagos today, and invalid dates. Actual purchasing and transfer services feed the reports to verify their connection to the ledger. Changing the database session between Pacific/Kiritimati and America/Los_Angeles produces the same reporting dates and totals.

The first browser run found an ambiguous test selector: “Units in” also matched the explanatory text beneath “Net change.” The selector now targets the exact metric label. The reported values were already correct. Browser journeys cover filter/URL persistence, refresh, pagination, low-stock drill-through, date changes, mobile overflow, keyboard access to wide tables, and recovery after a failed report request.

No new runtime dependency was introduced. Questions and exercises are in the private, local `questions.md`.
