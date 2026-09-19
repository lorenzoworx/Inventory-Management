WITH totals AS (
  SELECT product_id, store_id, sum(quantity) AS quantity
  FROM stock_movements GROUP BY product_id, store_id
)
SELECT coalesce(b.product_id, t.product_id) AS product_id,
       coalesce(b.store_id, t.store_id) AS store_id,
       b.quantity AS balance, coalesce(t.quantity, 0) AS movement_total
FROM stock_balances b FULL JOIN totals t USING (product_id, store_id)
WHERE b.quantity IS DISTINCT FROM coalesce(t.quantity, 0);
