# Lesson 4: a balance and the history that explains it

The product catalog describes an item. `stock_balances` describes how much of that item one location holds. Its primary key is the pair `(product_id, store_id)`, matching the learner's earlier decision that stores keep separate books.

`stock_movements` records signed changes, the resulting balance, the operator, time, and reason. Opening stock adds units, a sale subtracts units, and an adjustment can do either. Quantities are whole units; zero changes are rejected. An adjustment requires a reason. The application offers no edit/delete operation for movements: corrections add another adjustment.

Example: opening 10, sale of 3, and adjustment of -2 produce movements `+10, -3, -2`. The current balance is 5. The same product at another store has its own balance and movements.

## Follow a stock change

`stock-routes.ts` validates the request. `stock-service.ts` applies permissions and business rules. `stock-repository.ts` holds parameterized SQL. `database.ts` owns BEGIN, COMMIT, ROLLBACK, and returning the connection to the pool.

1. Reserve one database connection and begin a transaction.
2. Verify access to the actual location and operation. ADMIN can manage all stores, MANAGER can manage their assigned store, STAFF can sell at their assigned store, and VIEWER cannot write.
3. Claim the request UUID. A previously completed, identical request from the same user returns its saved result. Reusing it with different data or another user is rejected.
4. Check the product under a shared lock, then create the balance row if needed and lock that product/store balance for update.
5. For opening stock, verify that this product/store pair has no previous movements.
6. Conditionally update the balance only when the result is non-negative and fits the integer range.
7. Insert the signed movement and store the request's result.
8. Commit all changes. Any failure rolls back the request claim, balance, and movement together.

Every transaction statement uses the same connection; calling `pool.query` for some statements would break that guarantee. [pg transaction guidance](https://node-postgres.com/features/transactions)

```mermaid
sequenceDiagram
    participant A as Sale A: 7 units
    participant DB as PostgreSQL: balance 10
    participant B as Sale B: 7 units
    A->>DB: Lock balance row
    B->>DB: Request same lock; wait
    A->>DB: Balance 10 → 3; insert -7 movement
    A->>DB: COMMIT
    DB-->>B: Lock acquired; current balance is 3
    B->>DB: Conditional decrement affects no rows
    B->>DB: ROLLBACK
    DB-->>B: HTTP 409; insufficient stock
```

Row locks serialize competing changes for the same balance. The conditional update is also a guard against negative stock. [PostgreSQL row locking](https://www.postgresql.org/docs/18/explicit-locking.html)

## Retrying safely

The stock dialog generates one UUID for the entry and retains it after an error. A retry sends the same request ID. The unique request row makes concurrent repeats wait for the original transaction and return its result without inserting another movement. A browser test deliberately loses the first successful HTTP response and confirms the retry posts stock only once.

The saved result contains the balance immediately after that entry. Other entries may have happened since, so the UI reloads the current balance rather than treating that saved number as a fresh total. Closing the dialog and starting another entry represents a new request; after an uncertain result, retry the existing entry or inspect history first.

## Additional rules and verification

- An opening balance can only precede all history, even if the current balance has returned to zero.
- Inactive products cannot receive opening balances or sales. Corrective adjustments remain available; inactive products with stock stay visible.
- Reorder points belong to a product/store pair. Changing them does not change quantity or create a movement.
- Reads and searches are store-scoped and paginated. History shows timestamps in Africa/Lagos.
- `npm run db:verify-ledger` compares every stored balance against summed movements and exits unsuccessfully if a mismatch is found. It reports discrepancies without silently rewriting history.

The integration suite uses independent pooled connections for concurrent sales, concurrent openings, and duplicate request tests. One test installs a temporary test-database trigger that rejects a movement insert after the balance update, then verifies the entire transaction rolled back. Another intentionally corrupts a test balance to prove the verification query detects it. These are deliberate fault injections, not changes to production data.

Database owners can still edit tables directly; the application preserves history by exposing only append operations. Database operational permissions, backups, and release checks remain part of the deployment milestone. Purchasing and transfer stock changes will build on this transaction boundary in later increments.

Learning prompts are collected in the private local `questions.md`.
