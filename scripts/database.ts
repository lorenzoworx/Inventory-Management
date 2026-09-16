import { migrateDatabase, seedDatabase } from "../db/catalog.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL in .env. See .env.example.");

switch (process.argv[2]) {
  case "migrate": {
    const migrations = await migrateDatabase(databaseUrl);
    console.log(`Applied ${migrations.length} migration(s).`);
    break;
  }
  case "seed":
    await seedDatabase(databaseUrl);
    console.log("Fictional catalog seeded; existing products were preserved.");
    break;
  default:
    throw new Error("Use npm run db:migrate or npm run db:seed.");
}
