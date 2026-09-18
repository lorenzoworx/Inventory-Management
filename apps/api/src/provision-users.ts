import bcrypt from "bcrypt";
import { Pool } from "pg";

const accounts = [
  { email: "admin@uba.example", name: "Catalog Administrator", role: "ADMIN", store: null, key: "ADMIN_PASSWORD" },
  { email: "viewer@uba.example", name: "Portfolio Visitor", role: "VIEWER", store: null, key: "VIEWER_PASSWORD" },
  { email: "manager@uba.example", name: "Lagos Manager", role: "MANAGER", store: "LAGOS", key: "MANAGER_PASSWORD" },
  { email: "staff@uba.example", name: "Lagos Staff", role: "STAFF", store: "LAGOS", key: "STAFF_PASSWORD" }
] as const;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const rows = await Promise.all(accounts.map(async (account) => {
    const password = process.env[account.key] ?? "";
    if (password.length < 12 || Buffer.byteLength(password) > 72) throw new Error(`${account.key} must be 12–72 UTF-8 bytes. Run npm run setup:local for local credentials.`);
    return { ...account, hash: await bcrypt.hash(password, 12) };
  }));
  await client.query("BEGIN");
  for (const account of rows) {
    const store = account.store ? await client.query<{ id: number }>("SELECT id FROM stores WHERE code = $1", [account.store]) : null;
    if (store && !store.rows[0]) throw new Error("Seed the fictional locations before provisioning users.");
    await client.query(`INSERT INTO users (email, name, password_hash, role, store_id)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
    [account.email, account.name, account.hash, account.role, store?.rows[0]?.id ?? null]);
  }
  await client.query("COMMIT");
  console.log("Fictional accounts provisioned. Existing users and passwords were preserved.");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }
