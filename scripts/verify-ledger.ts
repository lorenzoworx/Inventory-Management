import { readFile } from "node:fs/promises";
import { Client } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(await readFile(new URL("../db/verify-ledger.sql", import.meta.url), "utf8"));
  if (result.rows.length) {
    console.table(result.rows);
    process.exitCode = 1;
  } else console.log("Ledger verified: every balance matches its movement total.");
} finally { await client.end(); }
