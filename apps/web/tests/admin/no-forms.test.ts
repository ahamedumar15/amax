import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(import.meta.dirname, "../..");
const files = (dir: string) => readdirSync(join(web, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(dir, f));
const SCREENS = ["app/(app)/settings", "app/(app)/settings/keys", "app/(app)/settings/integrations", "app/(app)/settings/ai", "app/(app)/settings/workflows", "components/workflows", "components/settings"];

describe("047 the admin screens are chat-first", () => {
  it("AC2 no write <form>, server action or direct service write on the hub and the four screens", () => {
    for (const f of SCREENS.flatMap(files)) {
      const src = readFileSync(join(web, f), "utf8");
      expect([f, /<form|"use server"|action=\{|from "\.\/actions"|putSecret|revokeSecret|setAiPolicy|savePolicy|revokeMcpClient|setScheduleEnabled|setEntityZone|\.control\(/.test(src)]).toEqual([f, false]);
    }
  });

  it("AC6 the Scheduler page reads schedules without syncing them on GET", () => {
    expect(readFileSync(join(web, "app/(app)/settings/workflows/page.tsx"), "utf8")).not.toMatch(/syncSchedules/);
  });
});
