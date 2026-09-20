#!/bin/sh
set -eu
# The maintenance owner is confined to CLI jobs. Express uses this unprivileged login.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password DB_APP_PASSWORD
SELECT format('CREATE ROLE ims_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
