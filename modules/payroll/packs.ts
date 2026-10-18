// 014 AC-4: the country-pack interface. The engine gathers the inputs (hr pay, leave, time, the pay
// group's own components), a pack turns them into payslip lines (`calculate`), what is owed to the
// state and funds (`statutory`) and what must be filed (`filings`). Sri Lanka (015) and Australia
// (016) register their packs with `registerPack` from `@amax/payroll/contracts`; the engine never
// changes for a new country. Amounts are Money (decimal strings), never floats.
import { addMoney, moneyOf, sumMoney, type Money } from "@amax/core";

export type PayLineKind = "earning" | "deduction" | "employer";
/** One payslip line. `basis` says how it was worked out ("Pro rata, 20 of 22 working days"). */
export type PayLine = { code: string; label: string; kind: PayLineKind; amount: Money; basis?: string | null };

export type PayInput = {
  personId: string; name: string; legalEntityId: string; country: string; currency: string;
  period: { month: string; from: string; to: string };
  /** Monday to Friday in the period, and those the person was employed on. */
  workingDays: number; daysPaid: number;
  /** From hr (011); null when HR holds none. */
  baseSalary: Money | null;
  /** The pay group's own components for the period: allowances, one-offs, deductions. */
  components: { code: string; label: string; kind: "earning" | "deduction"; amount: Money; basis: string | null }[];
  /** Approved unpaid leave in the period (leave, 012), in days. */
  unpaidLeaveDays: number;
  /** Hours over the standard week in approved timesheets (time, 009), when time is installed and readable. */
  overtimeHours: number;
};

export type RunForPack = { legalEntityId: string; country: string; currency: string; period: { month: string; from: string; to: string }; payslips: { personId: string; lines: PayLine[] }[] };
/** What the run owes a fund or the state, and by when. */
export type StatutoryDue = { code: string; label: string; payee: string; amount: Money; dueOn: string };
/** A return the run must be filed in, and by when. */
export type Filing = { code: string; label: string; dueOn: string; covers: number };

export type CountryPack = {
  /** Stable id a pay group names, e.g. "lk" (015) or "demo". */
  id: string;
  label: string;
  countries: string[];
  /** A demo pack with made-up rates, labelled as such wherever it shows. */
  fictional?: boolean;
  calculate: (input: PayInput) => PayLine[];
  statutory: (run: RunForPack) => StatutoryDue[];
  filings: (run: RunForPack) => Filing[];
};

const packs = new Map<string, CountryPack>();

/** Checks a pack's shape; returns it unchanged, for `registerPack`. */
export function definePack(p: CountryPack): CountryPack {
  if (!/^[a-z][a-z0-9-]*$/.test(p.id)) throw new Error(`country pack id "${p.id}" must be lower-case letters, digits and dashes`);
  for (const f of ["calculate", "statutory", "filings"] as const) if (typeof p[f] !== "function") throw new Error(`country pack ${p.id} has no ${f}()`);
  return p;
}

/** Installs a pack. Registering the same pack again is a no-op; a different pack with a taken id is refused. */
export function registerPack(p: CountryPack) {
  const had = packs.get(p.id);
  if (had && had !== p) throw new Error(`country pack ${p.id} is already registered`);
  packs.set(p.id, definePack(p));
}

export const installedPacks = () => [...packs.values()];
export function packFor(id: string): CountryPack {
  const p = packs.get(id);
  if (!p) throw new Error(`no country pack "${id}" is installed`);
  return p;
}

// Money arithmetic for packs, in integer units of 1/10000 (Money's scale), rounded half up to cents.
const UNITS = 10_000n;
const unitsOf = (m: Money) => BigInt(moneyOf(m.amount, m.currency).amount.replace(".", ""));
const fromUnits = (u: bigint, currency: string) => moneyOf(`${u < 0n ? "-" : ""}${(u < 0n ? -u : u) / UNITS}.${String((u < 0n ? -u : u) % UNITS).padStart(4, "0")}`, currency);
const roundCents = (u: bigint) => {
  const neg = u < 0n, a = neg ? -u : u;
  const r = ((a + 50n) / 100n) * 100n;
  return neg ? -r : r;
};
/** A decimal string as a fraction: "1.5" is 15/10. */
export function fraction(dec: string | number): [bigint, bigint] {
  const s = String(dec);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`"${s}" is not a non-negative decimal`);
  const [w, f = ""] = s.split(".");
  return [BigInt(w + f), 10n ** BigInt(f.length)];
}
/** m × num / den, rounded half up to cents. */
export function scaleMoney(m: Money, num: bigint, den: bigint): Money {
  if (den === 0n) throw new Error("money: divide by zero");
  return fromUnits(roundCents((unitsOf(m) * num) / den), m.currency);
}
/** `percent` of m ("8" or "1.5"), rounded half up to cents. */
export const percentOf = (m: Money, percent: string) => {
  const [n, d] = fraction(percent);
  return scaleMoney(m, n, d * 100n);
};
export const minMoney = (a: Money, b: Money) => (unitsOf(a) <= unitsOf(b) ? a : b);
export const isPositive = (m: Money) => unitsOf(m) > 0n;
export const isZero = (m: Money) => unitsOf(m) === 0n;
export const negate = (m: Money) => fromUnits(-unitsOf(m), m.currency);

/** Gross (earnings), deductions, net (gross less deductions) and the employer's own cost, from a payslip's lines. */
export function totalsOf(lines: PayLine[], currency: string) {
  const sum = (k: PayLineKind) => sumMoney(lines.filter((l) => l.kind === k).map((l) => l.amount), currency);
  const gross = sum("earning"), deductions = sum("deduction"), employer = sum("employer");
  return { gross, deductions, net: addMoney(gross, negate(deductions)), employer };
}
