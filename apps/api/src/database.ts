import type { Pool } from "pg";

export type Database = Pick<Pool, "query">;
export type TransactionRunner = <T>(work: (db: Database) => Promise<T>) => Promise<T>;

export function transactions(pool: Pool): TransactionRunner {
  return async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
}
