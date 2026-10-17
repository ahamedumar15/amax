// The presales fixtures are dated around Thu Oct 16 2026 (fixtures.md) and the screens count from the
// real today, so e2e moves every presales date forward by the days since then: the board reads as it
// did that day (14 days in Proposal, the demo still ahead, the same 12-month windows).
export const FIXTURE_DAY = "2026-10-16";
export const shiftDays = (now = new Date()) => Math.max(0, Math.round((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(FIXTURE_DAY)) / 86400000));

/** A fixture date as the shifted screens show it, e.g. "Oct 21". */
export const shown = (iso: string, days = shiftDays()) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const monthsSince = (now = new Date()) => (now.getUTCFullYear() - 2026) * 12 + now.getUTCMonth() - 9;

export const SHIFT_SQL = (days: number, months = monthsSince()) => `
  update presales.opportunity set created_at = created_at + interval '${days} days', updated_at = updated_at + interval '${days} days', stage_since = stage_since + interval '${days} days',
    closed_at = closed_at + interval '${days} days', expected_close = expected_close + ${days};
  update presales.stage_change set at = at + interval '${days} days';
  update presales.activity set on_date = on_date + ${days};
  update presales.task set due = due + ${days};
  update presales.suggestion set found_at = found_at + interval '${days} days';
  update presales.pipeline_snapshot set month = month + interval '${months} months', taken_at = taken_at + interval '${months} months';`;
