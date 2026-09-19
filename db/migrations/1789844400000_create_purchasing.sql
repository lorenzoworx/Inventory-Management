-- Up Migration
CREATE TABLE suppliers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  email text CHECK (length(email) BETWEEN 1 AND 254),
  phone text CHECK (length(btrim(phone)) BETWEEN 1 AND 40),
  address text CHECK (length(btrim(address)) BETWEEN 1 AND 500),
  is_active boolean NOT NULL DEFAULT true
);
CREATE SEQUENCE purchase_order_number_seq;
CREATE TABLE purchase_orders (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE DEFAULT ('PO-' || nextval('purchase_order_number_seq')::text),
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  store_id integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  ordered_at timestamptz,
  closed_at timestamptz,
  CHECK ((status IN ('RECEIVED', 'CANCELLED')) = (closed_at IS NOT NULL)),
  CHECK (status NOT IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED') OR ordered_at IS NOT NULL)
);
CREATE INDEX purchase_orders_store_status_idx ON purchase_orders(store_id, status, id DESC);
CREATE INDEX purchase_orders_supplier_idx ON purchase_orders(supplier_id);
CREATE TABLE purchase_order_lines (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id integer NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  ordered_qty integer NOT NULL CHECK (ordered_qty BETWEEN 1 AND 1000000),
  received_qty integer NOT NULL DEFAULT 0 CHECK (received_qty BETWEEN 0 AND ordered_qty),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost >= 0 AND unit_cost <> 'NaN'::numeric),
  UNIQUE(order_id, product_id),
  UNIQUE(id, product_id)
);
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('OPENING', 'SALE', 'ADJUSTMENT', 'PURCHASE'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_check CHECK ((kind IN ('OPENING', 'PURCHASE') AND quantity > 0) OR (kind = 'SALE' AND quantity < 0) OR kind = 'ADJUSTMENT');
ALTER TABLE stock_movements ADD COLUMN purchase_order_line_id integer;
ALTER TABLE stock_movements ADD FOREIGN KEY (purchase_order_line_id, product_id) REFERENCES purchase_order_lines(id, product_id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_purchase_link_check CHECK ((kind = 'PURCHASE') = (purchase_order_line_id IS NOT NULL));
CREATE INDEX stock_movements_purchase_line_idx ON stock_movements(purchase_order_line_id) WHERE purchase_order_line_id IS NOT NULL;

-- Down Migration
-- Refuse rollback while purchase movements exist: history must never be deleted implicitly.
ALTER TABLE stock_movements ADD CONSTRAINT no_purchase_movements CHECK (kind <> 'PURCHASE');
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_purchase_link_check;
ALTER TABLE stock_movements DROP COLUMN purchase_order_line_id;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('OPENING', 'SALE', 'ADJUSTMENT'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_check CHECK ((kind = 'OPENING' AND quantity > 0) OR (kind = 'SALE' AND quantity < 0) OR kind = 'ADJUSTMENT');
ALTER TABLE stock_movements DROP CONSTRAINT no_purchase_movements;
DROP TABLE purchase_order_lines;
DROP TABLE purchase_orders;
DROP SEQUENCE purchase_order_number_seq;
DROP TABLE suppliers;
