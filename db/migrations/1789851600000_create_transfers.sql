-- Up Migration
CREATE SEQUENCE transfer_number_seq;
CREATE TABLE transfers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE DEFAULT ('TR-' || nextval('transfer_number_seq')::text),
  source_id integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  destination_id integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  CHECK (source_id <> destination_id),
  CHECK ((status IN ('IN_TRANSIT', 'RECEIVED')) = (dispatched_at IS NOT NULL)),
  CHECK ((status = 'RECEIVED') = (received_at IS NOT NULL))
);
CREATE INDEX transfers_source_status_idx ON transfers(source_id, status, id DESC);
CREATE INDEX transfers_destination_status_idx ON transfers(destination_id, status, id DESC);
CREATE TABLE transfer_lines (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id integer NOT NULL REFERENCES transfers(id) ON DELETE RESTRICT,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  UNIQUE(transfer_id, product_id),
  UNIQUE(id, product_id)
);
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('OPENING', 'SALE', 'ADJUSTMENT', 'PURCHASE', 'TRANSFER_OUT', 'TRANSFER_IN'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_check CHECK ((kind IN ('OPENING', 'PURCHASE', 'TRANSFER_IN') AND quantity > 0) OR (kind IN ('SALE', 'TRANSFER_OUT') AND quantity < 0) OR kind = 'ADJUSTMENT');
ALTER TABLE stock_movements ADD COLUMN transfer_line_id integer;
ALTER TABLE stock_movements ADD FOREIGN KEY (transfer_line_id, product_id) REFERENCES transfer_lines(id, product_id) ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_transfer_link_check CHECK ((kind IN ('TRANSFER_OUT', 'TRANSFER_IN')) = (transfer_line_id IS NOT NULL));
CREATE UNIQUE INDEX stock_movements_transfer_line_kind_idx ON stock_movements(transfer_line_id, kind) WHERE transfer_line_id IS NOT NULL;

-- Down Migration
-- Refuse rollback if it would orphan transfer history.
ALTER TABLE stock_movements ADD CONSTRAINT no_transfer_movements CHECK (kind NOT IN ('TRANSFER_OUT', 'TRANSFER_IN'));
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_transfer_link_check;
ALTER TABLE stock_movements DROP COLUMN transfer_line_id;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind IN ('OPENING', 'SALE', 'ADJUSTMENT', 'PURCHASE'));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_check CHECK ((kind IN ('OPENING', 'PURCHASE') AND quantity > 0) OR (kind = 'SALE' AND quantity < 0) OR kind = 'ADJUSTMENT');
ALTER TABLE stock_movements DROP CONSTRAINT no_transfer_movements;
DROP TABLE transfer_lines;
DROP TABLE transfers;
DROP SEQUENCE transfer_number_seq;
