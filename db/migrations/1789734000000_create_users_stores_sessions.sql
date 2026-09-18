-- Up Migration
CREATE TABLE stores (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (name = btrim(name) AND name <> ''),
  kind text NOT NULL CHECK (kind IN ('SHOP', 'WAREHOUSE'))
);

CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
  name text NOT NULL CHECK (name = btrim(name) AND name <> ''),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')),
  store_id integer REFERENCES stores(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  CHECK ((role IN ('MANAGER', 'STAFF') AND store_id IS NOT NULL)
      OR (role IN ('ADMIN', 'VIEWER') AND store_id IS NULL))
);
CREATE INDEX users_store_id_idx ON users(store_id);

-- connect-pg-simple's storage format; application code never edits session JSON directly.
CREATE TABLE web_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX web_sessions_expire_idx ON web_sessions(expire);

-- Down Migration
DROP TABLE web_sessions;
DROP TABLE users;
DROP TABLE stores;
