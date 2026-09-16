-- Run from the repository root:
-- npm run db:shell -- -f db/exercises/02-catalog.sql

-- A starting query: inspect the six fictional products.
SELECT sku, name, sell_price, is_active
FROM products
ORDER BY sku;

-- Exercise A: write a SELECT returning sku, name, and sell_price for
-- active products only, ordered by sell_price from lowest to highest.
-- Start with SELECT, FROM, WHERE, and ORDER BY.
-- Write your query below:

-- Exercise B: extend your query with JOIN to display each category's name.
-- Products refer to categories through products.category_id = categories.id.
-- Use an alias for the category name so it is distinct from the product name.
-- Write your query below:
