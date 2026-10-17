import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createDb } from "./client";

// Real Postgres for tests. DB tests skip without DATABASE_MIGRATE_URL, except in CI where that's an error.
export const adminUrl = process.env.DATABASE_MIGRATE_URL;
if (process.env.CI && !adminUrl) throw new Error("CI: DATABASE_MIGRATE_URL must point at a Postgres the tests can create databases on");
export const hasDb = Boolean(adminUrl);

const withDb = (url: string, name: string) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

// A throwaway database. `owner` runs migrations; `app()` connects as owner but switches to amax_app,
// so row-level security applies exactly as it does for the running app.
export async function freshDatabase() {
  const name = `amax_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = withDb(adminUrl!, name);
  const owner = postgres(url, { max: 4, onnotice: () => {} });
  const apps: postgres.Sql[] = [];
  return {
    name,
    url,
    owner,
    app() {
      const { db, client } = createDb(url, { max: 4, connection: { options: "-c role=amax_app" } as never });
      apps.push(client);
      return db;
    },
    async drop() {
      await Promise.all([owner.end(), ...apps.map((c) => c.end())]);
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
