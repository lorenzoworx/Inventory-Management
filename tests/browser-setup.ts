import { migrateDatabase, seedDatabase } from "../db/catalog.js";
import { connectTestDatabase, testDatabaseUrl } from "./test-database.js";
import { seedTestAccounts } from "./auth-fixtures.js";

export default async function setup() {
  const client = await connectTestDatabase();
  try {
    await migrateDatabase(testDatabaseUrl());
    await seedDatabase(testDatabaseUrl());
    await seedTestAccounts(client);
  } finally { await client.end(); }
}
