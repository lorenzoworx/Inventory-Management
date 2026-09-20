import { Pool } from "pg";
import { seedDemo } from "../db/demo.js";
import { transactions } from "../apps/api/src/database.js";

if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true to opt in to fictional stock and workflow fixtures.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  console.log(await seedDemo(transactions(pool)) ? "Fictional demo stock, purchases, and transfers created." : "Demo fixtures already exist; nothing changed.");
} finally { await pool.end(); }
