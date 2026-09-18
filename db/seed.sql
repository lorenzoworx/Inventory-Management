-- Fictional learning data. Re-running this adds missing rows without
-- overwriting edits the learner has made to existing products.
INSERT INTO categories (name)
VALUES ('Pantry'), ('Beverages'), ('Household')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (sku, name, unit, cost_price, sell_price, category_id, is_active)
SELECT sample.sku, sample.name, sample.unit, sample.cost_price, sample.sell_price,
       categories.id, sample.is_active
FROM (
    VALUES
        ('RICE-001', 'Rice 5 kg', 'bag', 15000.00, 18500.00, 'Pantry', true),
        ('BEANS-001', 'Beans 1 kg', 'bag', 1800.00, 2300.00, 'Pantry', true),
        ('WATER-001', 'Water 75 cl', 'bottle', 150.00, 200.00, 'Beverages', true),
        ('JUICE-001', 'Orange juice 1 L', 'carton', 950.00, 1250.00, 'Beverages', true),
        ('SOAP-001', 'Bar soap', 'each', 120.00, 180.00, 'Household', true),
        ('SOAP-OLD', 'Discontinued soap', 'each', 100.00, 140.00, 'Household', false)
) AS sample(sku, name, unit, cost_price, sell_price, category_name, is_active)
JOIN categories ON categories.name = sample.category_name
ON CONFLICT (sku) DO NOTHING;
INSERT INTO stores (code, name, kind) VALUES
  ('LAGOS', 'Lagos Central', 'SHOP'),
  ('IBADAN', 'Ibadan Market', 'SHOP'),
  ('DEPOT', 'Main Warehouse', 'WAREHOUSE')
ON CONFLICT (code) DO NOTHING;
