import bcrypt from "bcrypt";
import type { Client } from "pg";
import type { Role } from "@ims/contracts";

// These credentials are exclusively for the guarded _test database.
export const testPassword = "Test-only-password-47";
export const testSessionSecret = "test-only-session-secret-never-use-for-deployment";
export const testEmail = (role: Role) => `test-${role.toLowerCase()}@uba.example`;

export async function seedTestAccounts(client: Client) {
  const actual = await client.query<{ name: string }>("SELECT current_database() AS name");
  if (!actual.rows[0]?.name.endsWith("_test")) throw new Error("Test accounts require a _test database.");
  const hashed = await bcrypt.hash(testPassword, 4);
  const store = await client.query<{ id: number }>("SELECT id FROM stores WHERE code = 'LAGOS'");
  for (const role of ["ADMIN", "MANAGER", "STAFF", "VIEWER"] as const) {
    await client.query(`INSERT INTO users (email, name, password_hash, role, store_id) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, store_id = EXCLUDED.store_id, is_active = true`,
    [testEmail(role), `Test ${role.toLowerCase()}`, hashed, role, role === "MANAGER" || role === "STAFF" ? store.rows[0]!.id : null]);
  }
}
