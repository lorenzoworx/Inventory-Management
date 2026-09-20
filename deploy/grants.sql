-- Reapply after migrations or restore. No runtime DDL, user provisioning, or ledger rewriting.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ims_app;
GRANT USAGE ON SCHEMA public TO ims_app;
GRANT SELECT ON categories, products, stores, users, suppliers, stock_balances, stock_requests,
  stock_movements, purchase_orders, purchase_order_lines, transfers, transfer_lines TO ims_app;
GRANT INSERT, UPDATE ON categories, products, suppliers, stock_balances, stock_requests,
  purchase_orders, purchase_order_lines, transfers, transfer_lines TO ims_app;
GRANT INSERT ON stock_movements TO ims_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON web_sessions TO ims_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ims_app;
