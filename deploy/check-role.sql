DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ims_app' AND (rolsuper OR rolcreatedb OR rolcreaterole))
    OR has_table_privilege('ims_app', 'stock_movements', 'UPDATE')
    OR has_table_privilege('ims_app', 'stock_movements', 'DELETE')
    OR has_table_privilege('ims_app', 'users', 'UPDATE')
    OR has_schema_privilege('ims_app', 'public', 'CREATE')
    OR NOT has_table_privilege('ims_app', 'stock_movements', 'INSERT')
    OR NOT has_table_privilege('ims_app', 'web_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'Unexpected runtime database permissions';
  END IF;
END $$;
