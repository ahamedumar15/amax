import { join } from "node:path";
import { createDb, migrate, migrationScopes } from "@amax/db";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "../installed";

export const E2E_DB = "amax_e2e_time";
const root = join(import.meta.dirname, "../../../..");

const admin = process.env.DATABASE_MIGRATE_URL;
if (!admin) throw new Error("time e2e needs DATABASE_MIGRATE_URL");
const server = createDb(admin, { max: 1 }).client;
await server.unsafe(`drop database if exists ${E2E_DB} with (force)`);
await server.unsafe(`create database ${E2E_DB}`);
await server.end();
const ownerUrl = Object.assign(new URL(admin), { pathname: `/${E2E_DB}` }).toString();
const owner = createDb(ownerUrl, { max: 1 }).client;
await migrate(owner, migrationScopes(root));
await owner.end();
const { db, client } = createDb(ownerUrl, { max: 1, connection: { options: "-c role=amax_app" } as never });
await loadFixtures(db, [{ id: "auth", fixtures: [authFixtures] }, ...(await installedModules())], lumen);
await client.end();
