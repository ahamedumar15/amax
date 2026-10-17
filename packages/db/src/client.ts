import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Db = PostgresJsDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(url: string, options: postgres.Options<Record<string, never>> = {}) {
  const client = postgres(url, { max: 10, onnotice: () => {}, ...options });
  return { db: drizzle(client), client };
}
