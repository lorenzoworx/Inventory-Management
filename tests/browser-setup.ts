import { migrateDatabase, seedDatabase } from "../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "./test-database.js";

export default async function setup() {
  const client = await connectTestDatabase();
  await client.end();
  await migrateDatabase(testDatabaseUrl());
  await seedDatabase(testDatabaseUrl());
}
