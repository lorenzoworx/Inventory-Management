import { existsSync } from "node:fs";
import { Client } from "pg";

if (existsSync(".env")) process.loadEnvFile(".env");

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a separate database ending in _test.");
  const name = decodeURIComponent(new URL(url).pathname);
  if (!name.endsWith("_test")) throw new Error("Tests require a database name ending in _test.");
  if (process.env.DATABASE_URL && name === decodeURIComponent(new URL(process.env.DATABASE_URL).pathname)) {
    throw new Error("Test and development databases must have different names.");
  }
  return url;
}

export async function connectTestDatabase() {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  const result = await client.query<{ name: string }>("SELECT current_database() AS name");
  if (!result.rows[0]?.name.endsWith("_test")) {
    await client.end();
    throw new Error("Refusing to modify a database without the _test suffix.");
  }
  return client;
}
