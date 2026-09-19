-- Up Migration
CREATE TABLE stock_balances (
  product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_point integer NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  PRIMARY KEY (product_id, store_id)
);
CREATE INDEX stock_balances_store_idx ON stock_balances(store_id, product_id);

CREATE TABLE stock_requests (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL,
  store_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('OPENING', 'SALE', 'ADJUSTMENT')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  actor_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES stock_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (product_id, store_id) REFERENCES stock_balances(product_id, store_id) ON DELETE RESTRICT,
  CHECK ((kind = 'OPENING' AND quantity > 0) OR (kind = 'SALE' AND quantity < 0) OR kind = 'ADJUSTMENT'),
  CHECK (kind <> 'ADJUSTMENT' OR length(btrim(note)) >= 3)
);
CREATE INDEX stock_movements_store_idx ON stock_movements(store_id, id DESC);
CREATE INDEX stock_movements_product_store_idx ON stock_movements(product_id, store_id, id DESC);
CREATE INDEX stock_movements_request_idx ON stock_movements(request_id);

-- Down Migration
DROP TABLE stock_movements;
DROP TABLE stock_requests;
DROP TABLE stock_balances;
