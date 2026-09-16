-- Up Migration

CREATE TABLE categories (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE CHECK (name = btrim(name) AND name <> '')
);

CREATE TABLE products (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku text NOT NULL UNIQUE CHECK (sku = btrim(sku) AND sku <> ''),
    barcode text UNIQUE CHECK (barcode = btrim(barcode) AND barcode <> ''),
    name text NOT NULL CHECK (name = btrim(name) AND name <> ''),
    unit text NOT NULL DEFAULT 'each' CHECK (unit = btrim(unit) AND unit <> ''),
    cost_price numeric(12, 2) NOT NULL
        CHECK (cost_price >= 0 AND cost_price <> 'NaN'::numeric),
    sell_price numeric(12, 2) NOT NULL
        CHECK (sell_price >= 0 AND sell_price <> 'NaN'::numeric),
    category_id integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_category_id_idx ON products(category_id);

-- Down Migration
-- Reverse the dependency order: products reference categories.
DROP TABLE products;
DROP TABLE categories;
