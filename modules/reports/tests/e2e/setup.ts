import { join } from "node:path";
import { createDb, migrate, migrationScopes } from "@amax/db";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { installAuthorizer, setGrants } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { agentsPlatform } from "@amax/agents/module";
import { setSuggestionKinds } from "@amax/agents/server";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "../installed";

const E2E_DB = process.env.REPORTS_E2E_DB ?? "amax_e2e_027";
const root = join(import.meta.dirname, "../../../..");

const admin = process.env.DATABASE_MIGRATE_URL;
if (!admin) throw new Error("reports e2e needs DATABASE_MIGRATE_URL");
const server = createDb(admin, { max: 1 }).client;
await server.unsafe(`drop database if exists ${E2E_DB} with (force)`);
await server.unsafe(`create database ${E2E_DB}`);
await server.end();
const ownerUrl = Object.assign(new URL(admin), { pathname: `/${E2E_DB}` }).toString();
const owner = createDb(ownerUrl, { max: 1 }).client;
await migrate(owner, migrationScopes(root));
await owner.end();
const { db, client } = createDb(ownerUrl, { max: 2, connection: { options: "-c role=amax_app" } as never });
const modules = await installedModules();
await loadFixtures(db, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
// Pending events (time.entry.logged and the rest) are delivered as the app's job tick would.
configureRuntime({ db, auditKey: "e2e-audit-key-e2e-audit-key-e2e-audit" });
setGrants([...modules, agentsPlatform as never]);
setSuggestionKinds(modules.flatMap((m) => m.suggestions ?? []));
installAuthorizer();
await runDueJobs(db, registryFrom(modules));
await client.end();
const settings = createDb(ownerUrl, { max: 1 }).client;
await settings`insert into ai.settings (tenant_id, zdr_confirmed) values (${lumen.tenant.id}, true) on conflict do nothing`;
await settings.end();
