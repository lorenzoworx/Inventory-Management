-- Stable business-data fingerprints for a small demo; no credentials or row contents are printed.
CREATE TEMP TABLE fingerprints (name text, digest text);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['categories', 'products', 'stores', 'users', 'suppliers', 'stock_balances',
    'stock_requests', 'stock_movements', 'purchase_orders', 'purchase_order_lines', 'transfers', 'transfer_lines', 'schema_migrations']
  LOOP
    EXECUTE format('INSERT INTO fingerprints SELECT %L, md5(coalesce(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM %I t', table_name, table_name);
  END LOOP;
END $$;
SELECT name || ':' || digest FROM fingerprints ORDER BY name;
SELECT sequencename || ':' || coalesce(last_value::text, 'unused') FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
