import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { EVENTS as ONBOARDING } from "@amax/onboarding/contracts";
import manifest from "../module";
import { helpdeskView } from "../server/views";
import { helpdeskDb, sharedDb, T } from "./db";

describe.skipIf(!hasDb)("integrations, with every module installed (Postgres)", () => {
  const use = sharedDb();

  it("AC1 a joiner's onboarding checklist opens one Hardware ticket raised by their manager, and 025's ticket route lights up", async () => {
    const db = use();
    const [p] = await db.q(sql`select id, legal_entity_id from hr.person where name = 'Dinesh Wickrama'`);
    const started = { checklistId: "0d6f6a52-6a2b-4f0e-9a52-6c7e1f0a2b01", kind: "joiner", personId: p.id, legalEntityId: p.legal_entity_id, startsOn: "2026-11-09", templateId: null, tasks: 6, by: "test" };
    for (let i = 0; i < 2; i++) await db.q(sql`insert into core.event (tenant_id, name, payload) values (${T}, ${ONBOARDING.checklistStarted}, ${JSON.stringify(started)}::jsonb)`);
    await db.tick();
    const tickets = await db.q(sql`select t.title, t.category, q.key as queue, t.note, u.name as requester from helpdesk.ticket t join helpdesk.queue q on q.id = t.queue_id
      left join auth.user u on u.id = t.requester_user_id where t.origin = 'onboarding' and t.origin_ref = ${started.checklistId}`);
    expect(tickets).toEqual([{ title: "Laptop for new joiner, Nov 9", category: "Hardware", queue: "it", note: "Created by onboarding checklist", requester: "Maya Fernando" }]);
    // 025's ticket route (modules/inbox-agent/routes.ts) is lit once helpdesk.ticket exists, and adds through these names.
    expect(await db.q(sql`select to_regclass('helpdesk.ticket') is not null as on`)).toEqual([{ on: true }]);
    expect([manifest.chatIntents?.some((c) => (c as { id: string }).id === "helpdesk.new-ticket"), manifest.mcpTools?.some((t) => t.name === "create_ticket"), manifest.permissions?.includes("helpdesk:ticket:create")]).toEqual([true, true, true]);
  }, 120_000);
});

describe.skipIf(!hasDb)("without hr, onboarding and the inbox agent (Postgres)", () => {
  let db: Awaited<ReturnType<typeof helpdeskDb>> | undefined;
  afterAll(() => db?.t.drop());

  it("AC4 the helpdesk still loads, names requesters by their user name, and nothing else is needed", async () => {
    db = await helpdeskDb(discoverModules(join(repoRoot, "modules")).filter((m) => m !== "helpdesk"));
    expect(db.modules.map((m) => m.id)).toEqual(["helpdesk"]);
    const v = await helpdeskView(await db.as("maya"));
    expect([v.stats.open, v.tickets[0].number, v.tickets[0].requester]).toEqual([27, "INC-20431", "Ayesha Rahman"]);
    await db.tick();
  }, 240_000);
});
