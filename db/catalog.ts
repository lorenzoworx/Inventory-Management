import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";

export function migrateDatabase(databaseUrl: string) {
  return runner({
    databaseUrl,
    dir: fileURLToPath(new URL("./migrations/", import.meta.url)),
    direction: "up",
    migrationsTable: "schema_migrations",
    log: () => {}
  });
}

export async function seedDatabase(databaseUrl: string) {
  const sql = await readFile(new URL("./seed.sql", import.meta.url), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
