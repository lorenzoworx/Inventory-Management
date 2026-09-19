import type { Database } from "./database.js";
import type { Category, Product, ProductInput, ProductQuery } from "@ims/contracts";

type ProductRow = Omit<Product, "createdAt"> & { createdAt: Date };
const columns = `p.id, p.sku, p.barcode, p.name, p.unit,
  p.cost_price AS "costPrice", p.sell_price AS "sellPrice",
  p.category_id AS "categoryId", c.name AS "categoryName",
  p.is_active AS "isActive", p.created_at AS "createdAt"`;
const toProduct = (row: ProductRow): Product => ({ ...row, createdAt: row.createdAt.toISOString() });

export function catalogRepository(db: Database) {
  return {
    async listProducts(query: ProductQuery) {
      // Literal substring search: %, _, and quotes remain ordinary user data.
      const where = `WHERE ($1 = '' OR strpos(lower(p.name), lower($1)) > 0
        OR strpos(lower(p.sku), lower($1)) > 0 OR strpos(lower(coalesce(p.barcode, '')), lower($1)) > 0)
        AND ($2::integer IS NULL OR p.category_id = $2)
        AND ($3::boolean IS NULL OR p.is_active = $3)`;
      const filters = [query.q, query.categoryId ?? null, query.status === "all" ? null : query.status === "active"];
      const count = await db.query<{ total: number }>(`SELECT count(*)::integer AS total FROM products p ${where}`, filters);
      const rows = await db.query<ProductRow>(
        `SELECT ${columns} FROM products p JOIN categories c ON c.id = p.category_id ${where}
         ORDER BY lower(p.name), p.id LIMIT $4 OFFSET $5`,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize]
      );
      return { items: rows.rows.map(toProduct), total: count.rows[0]!.total, page: query.page, pageSize: query.pageSize };
    },
    async getProduct(id: number) {
      const result = await db.query<ProductRow>(
        `SELECT ${columns} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [id]
      );
      return result.rows[0] ? toProduct(result.rows[0]) : undefined;
    },
    async createProduct(input: ProductInput) {
      const result = await db.query<{ id: number }>(
        `INSERT INTO products (sku, barcode, name, unit, cost_price, sell_price, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [input.sku, input.barcode, input.name, input.unit, input.costPrice, input.sellPrice, input.categoryId]
      );
      return result.rows[0]!.id;
    },
    async updateProduct(id: number, input: ProductInput) {
      const result = await db.query(
        `UPDATE products SET sku = $2, barcode = $3, name = $4, unit = $5,
         cost_price = $6, sell_price = $7, category_id = $8 WHERE id = $1`,
        [id, input.sku, input.barcode, input.name, input.unit, input.costPrice, input.sellPrice, input.categoryId]
      );
      return result.rowCount === 1;
    },
    async setProductStatus(id: number, isActive: boolean) {
      const result = await db.query("UPDATE products SET is_active = $2 WHERE id = $1", [id, isActive]);
      return result.rowCount === 1;
    },
    async listCategories(page: number, pageSize: number) {
      const count = await db.query<{ total: number }>("SELECT count(*)::integer AS total FROM categories");
      const rows = await db.query<Category>(
        "SELECT id, name FROM categories ORDER BY lower(name), id LIMIT $1 OFFSET $2", [pageSize, (page - 1) * pageSize]
      );
      return { items: rows.rows, total: count.rows[0]!.total, page, pageSize };
    },
    async createCategory(name: string) {
      const result = await db.query<Category>("INSERT INTO categories (name) VALUES ($1) RETURNING id, name", [name]);
      return result.rows[0]!;
    },
    async updateCategory(id: number, name: string) {
      const result = await db.query<Category>("UPDATE categories SET name = $2 WHERE id = $1 RETURNING id, name", [id, name]);
      return result.rows[0];
    }
  };
}
