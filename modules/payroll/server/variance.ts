import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { monthLabel } from "./read";

// T4: the payroll agent's variance check. It compares each person's net pay with the last paid run of
// the same pay group and explains the difference from the payslip lines that changed. It is rule
// based (no model call): the explanation names lines and their basis, never an amount, so HR can read
// it while the amounts stay masked (002).
export type Change = {
  personId: string; userId: string | null; personName: string; kind: "joiner" | "leaver" | "pay";
  was: string; now: string; amount: string; explanation: string; needsCheck: boolean; confidence: number;
};

type Slip = { person_id: string; user_id: string | null; person_name: string; net: string; flags: string[]; days_paid: string; working_days: number };
type Line = { person_id: string; code: string; label: string; kind: string; amount: string; basis: string | null };

/** Codes whose change needs a person to check before anything is deducted. */
const CHECK = new Set(["no-pay", "unpaid-leave"]);
/** Lines that only follow from others (tax and contributions): named once, at the end. */
const FOLLOW = /tax|pension|welfare|epf|etf|apit|payg|super/i;

const cents = (v: string) => BigInt(String(v).replace(/^(-?\d+)(?:\.(\d{0,2})\d*)?$/, (_m, w: string, f = "") => `${w}${f.padEnd(2, "0")}`));
const fromCents = (c: bigint) => {
  const neg = c < 0n, a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The last paid run of the group before this period. */
export async function previousRun(tx: Tx, payGroupId: string, period: string) {
  const [r] = await tx.execute(sql`select id, period from payroll.run where pay_group_id = ${payGroupId} and period < ${period} and status = 'payslips_sent' order by period desc limit 1`);
  return r ? { id: r.id as string, month: String(r.period instanceof Date ? r.period.toISOString() : r.period).slice(0, 7) } : null;
}

async function slipsOf(tx: Tx, runId: string) {
  const slips = (await tx.execute(sql`select person_id, user_id, person_name, net, flags, days_paid, working_days from payroll.payslip where run_id = ${runId}`)) as unknown as Slip[];
  const lines = (await tx.execute(sql`select s.person_id, l.code, l.label, l.kind, l.amount, l.basis from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id where s.run_id = ${runId} order by l.position`)) as unknown as Line[];
  return { slips: new Map(slips.map((s) => [s.person_id, s])), lines };
}

function explainPay(before: Line[], after: Line[]) {
  const key = (l: Line) => `${l.kind}:${l.code}`;
  const was = new Map(before.map((l) => [key(l), l]));
  const now = new Map(after.map((l) => [key(l), l]));
  const parts: string[] = [];
  let needsCheck = false, follows = false, known = true;
  for (const [k, l] of now) {
    const b = was.get(k);
    if (b && cents(b.amount) === cents(l.amount)) continue;
    if (FOLLOW.test(l.code)) { follows = true; continue; }
    if (CHECK.has(l.code)) needsCheck = true;
    const what = `${l.label}${l.basis ? `: ${l.basis}` : ""}`;
    parts.push(b ? `${l.label} changed${l.basis ? ` (${l.basis})` : ""}` : what);
  }
  for (const [k, b] of was) {
    if (now.has(k) || FOLLOW.test(b.code)) continue;
    parts.push(`No ${b.label.toLowerCase()} this month${b.basis ? `; last month's was ${b.basis.charAt(0).toLowerCase()}${b.basis.slice(1)}` : ""}`);
  }
  if (!parts.length) { known = false; parts.push("Contributions or tax changed with no change in earnings"); }
  if (needsCheck) parts.push("No deduction until someone accepts it");
  else if (follows) parts.push("Tax and contributions follow");
  return { explanation: parts.join(". ").replace(/\.\./g, "."), needsCheck, confidence: known ? (needsCheck ? 0.6 : 0.9) : 0.5 };
}

/**
 * Every person whose net pay differs from the last paid run: joiners, leavers and pay changes. With no
 * earlier paid run there is nothing to compare, so no changes.
 */
export async function varianceOf(tx: Tx, run: { id: string; pay_group_id: string; period: string }, people: Map<string, { joinedOn: string | null; leftOn: string | null }>): Promise<{ previous: string | null; changes: Change[] }> {
  const prev = await previousRun(tx, run.pay_group_id, run.period);
  if (!prev) return { previous: null, changes: [] };
  const [a, b] = [await slipsOf(tx, prev.id), await slipsOf(tx, run.id)];
  const prevLabel = monthLabel(prev.month).split(" ")[0];
  const changes: Change[] = [];
  for (const id of new Set([...a.slips.keys(), ...b.slips.keys()])) {
    const was = a.slips.get(id), now = b.slips.get(id);
    const diff = (now ? cents(now.net) : 0n) - (was ? cents(was.net) : 0n);
    if (diff === 0n) continue;
    const who = people.get(id);
    const base = { personId: id, userId: (now ?? was)!.user_id ?? null, personName: (now ?? was)!.person_name, was: fromCents(was ? cents(was.net) : 0n), now: fromCents(now ? cents(now.net) : 0n), amount: fromCents(diff) };
    if (!was && now) {
      const joined = who?.joinedOn && who.joinedOn.slice(0, 7) === run.period.slice(0, 7);
      changes.push({ ...base, kind: "joiner", needsCheck: false, confidence: joined ? 0.95 : 0.7,
        explanation: joined ? `First salary: joined ${day(who!.joinedOn!)}, paid ${Number(now.days_paid) < now.working_days ? `pro rata for ${Number(now.days_paid)} of ${now.working_days} working days` : "the full month"}` : `New to this pay group since ${prevLabel}` });
    } else if (was && !now) {
      const settled = a.lines.some((l) => l.person_id === id && /settlement/i.test(l.code));
      changes.push({ ...base, kind: "leaver", needsCheck: false, confidence: who?.leftOn ? 0.95 : 0.6,
        explanation: who?.leftOn ? `${settled ? `Final settlement was paid in ${prevLabel}; ` : ""}left ${day(who.leftOn)}, so not paid this month` : `Not in this run; was paid in ${prevLabel}` });
    } else {
      const e = explainPay(a.lines.filter((l) => l.person_id === id), b.lines.filter((l) => l.person_id === id));
      changes.push({ ...base, kind: "pay", ...e });
    }
  }
  return { previous: prev.month, changes: changes.sort((x, y) => Number(x.needsCheck) - Number(y.needsCheck) || x.personName.localeCompare(y.personName)) };
}
