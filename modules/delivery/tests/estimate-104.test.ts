import { describe, expect, it } from "vitest";
import { estimateDays } from "../sync/estimate";

const at = (h: string, day = "2026-11-12") => `${day}T${h}:00Z`;

// 104 AC-3: hours from commit times: sessions 90 minutes apart, 30 minutes before the first, quarter hours, 8 h a day,
// split at midnight UTC.
describe("104 AC-3 the estimate from commit times", () => {
  it.each([
    ["one commit is half an hour", [at("09:00")], [{ day: "2026-11-12", hours: 0.5, commits: 1 }]],
    ["one session: 30 minutes before the first commit to the last", [at("09:00"), at("09:40"), at("10:15")], [{ day: "2026-11-12", hours: 1.75, commits: 3 }]],
    ["two sessions when commits are 90 minutes or more apart, summed", [at("09:00"), at("09:30"), at("11:00"), at("11:20")], [{ day: "2026-11-12", hours: 1.75, commits: 4 }]],
    ["rounded to a quarter hour", [at("09:00"), at("09:07")], [{ day: "2026-11-12", hours: 0.5, commits: 2 }]],
    ["capped at 8 hours a day", Array.from({ length: 12 }, (_, i) => at(`${String(8 + i).padStart(2, "0")}:00`)), [{ day: "2026-11-12", hours: 8, commits: 12 }]],
    ["a session across midnight is split by day", [at("23:30"), at("00:45", "2026-11-13")], [{ day: "2026-11-12", hours: 1, commits: 0 }, { day: "2026-11-13", hours: 0.75, commits: 2 }]],
    ["order of input doesn't matter, and an unreadable time is skipped", [at("10:15"), "soon", at("09:00")], [{ day: "2026-11-12", hours: 1.75, commits: 2 }]],
    ["no commits, no days", [], []],
  ])("AC-3 %s", (_, times, days) => {
    expect(estimateDays(times)).toEqual(days);
  });
});
