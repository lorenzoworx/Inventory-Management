-- Up Migration
CREATE INDEX stock_movements_store_created_idx ON stock_movements(store_id, created_at);
CREATE INDEX stock_movements_created_idx ON stock_movements(created_at);

-- Down Migration
DROP INDEX stock_movements_created_idx;
DROP INDEX stock_movements_store_created_idx;
