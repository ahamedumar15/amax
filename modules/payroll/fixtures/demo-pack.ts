import { addMoney, moneyOf, sumMoney, type Money } from "@amax/core";
import { definePack, isPositive, minMoney, negate, percentOf, scaleMoney, type PayLine, type RunForPack, type StatutoryDue } from "../packs";

// A demo country pack with simple, made-up rates (014 T3), so the engine and the screen run end to
// end until the real Sri Lanka (015) and Australia (016) packs land. Nothing here is a real statutory
// rule: every label says "demo".
const PENSION_EMPLOYEE = "8";
const PENSION_EMPLOYER = "12";
const WELFARE_EMPLOYER = "3";
const OVERTIME_RATE: [bigint, bigint] = [3n, 2n]; // time and a half
/** Monthly tax bands per currency: tax-free up to the first figure, 10% on the next, 20% above. */
const BANDS: Record<string, [string, string]> = { LKR: ["150000", "100000"], AUD: ["1500", "1000"] };

const line = (code: string, label: string, kind: PayLine["kind"], amount: Money, basis: string | null = null): PayLine => ({ code, label, kind, amount, basis });
const dueOn = (month: string, day: number) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function tax(taxable: Money): Money {
  const [free, band] = BANDS[taxable.currency] ?? ["1500", "1000"];
  const zero = moneyOf(0, taxable.currency);
  const over = addMoney(taxable, negate(moneyOf(free, taxable.currency)));
  if (!isPositive(over)) return zero;
  const first = minMoney(over, moneyOf(band, taxable.currency));
  const rest = addMoney(over, negate(first));
  return addMoney(percentOf(first, "10"), isPositive(rest) ? percentOf(rest, "20") : zero);
}

export const demoPack = definePack({
  id: "demo",
  label: "Demo country pack (fictional rates)",
  countries: ["LK", "AU"],
  fictional: true,
  calculate(p) {
    const c = p.currency;
    const lines: PayLine[] = [];
    if (p.baseSalary) {
      const basic = p.daysPaid < p.workingDays ? scaleMoney(p.baseSalary, BigInt(p.daysPaid), BigInt(p.workingDays)) : p.baseSalary;
      lines.push(line("basic", "Basic salary", "earning", basic, p.daysPaid < p.workingDays ? `Pro rata, ${p.daysPaid} of ${p.workingDays} working days` : null));
    }
    for (const x of p.components.filter((x) => x.kind === "earning")) lines.push(line(x.code, x.label, "earning", x.amount, x.basis));
    if (p.baseSalary && p.overtimeHours > 0) {
      const [h, d] = [BigInt(Math.round(p.overtimeHours * 10)), 10n];
      lines.push(line("overtime", `Overtime, ${p.overtimeHours} h`, "earning", scaleMoney(p.baseSalary, h * OVERTIME_RATE[0], d * OVERTIME_RATE[1] * BigInt(p.workingDays * 8)), "Approved timesheets over 40 h a week, time and a half"));
    }
    if (p.baseSalary && p.unpaidLeaveDays > 0) {
      lines.push(line("unpaid-leave", `Unpaid leave, ${plural(p.unpaidLeaveDays, "day")}`, "deduction", scaleMoney(p.baseSalary, BigInt(Math.round(p.unpaidLeaveDays * 2)), BigInt(p.workingDays * 2)), "Approved unpaid leave"));
    }
    for (const x of p.components.filter((x) => x.kind === "deduction")) lines.push(line(x.code, x.label, "deduction", x.amount, x.basis));
    // Pension on basic and the fixed allowance; tax on gross less the employee's pension.
    const pensionable = sumMoney(lines.filter((l) => l.code === "basic" || l.code === "allowance").map((l) => l.amount), c);
    const gross = sumMoney(lines.filter((l) => l.kind === "earning").map((l) => l.amount), c);
    if (isPositive(pensionable)) lines.push(line("demo-pension", `Demo pension, employee ${PENSION_EMPLOYEE}%`, "deduction", percentOf(pensionable, PENSION_EMPLOYEE), "Fictional rate (demo pack)"));
    const employeePension = lines.find((l) => l.code === "demo-pension")?.amount ?? moneyOf(0, c);
    const t = tax(addMoney(gross, negate(employeePension)));
    if (isPositive(t)) lines.push(line("demo-tax", "Demo income tax", "deduction", t, "Fictional bands (demo pack): none to the first band, then 10% and 20%"));
    if (isPositive(pensionable)) {
      lines.push(line("demo-pension-employer", `Demo pension, employer ${PENSION_EMPLOYER}%`, "employer", percentOf(pensionable, PENSION_EMPLOYER), "Fictional rate (demo pack)"));
      lines.push(line("demo-welfare", `Demo welfare fund, employer ${WELFARE_EMPLOYER}%`, "employer", percentOf(pensionable, WELFARE_EMPLOYER), "Fictional rate (demo pack)"));
    }
    return lines;
  },
  statutory(run: RunForPack): StatutoryDue[] {
    const all = run.payslips.flatMap((s) => s.lines);
    const sum = (codes: string[]) => sumMoney(all.filter((l) => codes.includes(l.code)).map((l) => l.amount), run.currency);
    const out: StatutoryDue[] = [
      { code: "demo-pension", label: "Demo pension", payee: "Demo pension fund (fictional)", amount: sum(["demo-pension", "demo-pension-employer"]), dueOn: dueOn(run.period.month, 30) },
      { code: "demo-welfare", label: "Demo welfare", payee: "Demo welfare fund (fictional)", amount: sum(["demo-welfare"]), dueOn: dueOn(run.period.month, 30) },
      { code: "demo-tax", label: "Demo income tax", payee: "Demo tax office (fictional)", amount: sum(["demo-tax"]), dueOn: dueOn(run.period.month, 15) },
    ];
    return out.filter((s) => isPositive(s.amount));
  },
  filings: (run) => [{ code: "demo-monthly-return", label: "Demo monthly return (fictional)", dueOn: dueOn(run.period.month, 15), covers: run.payslips.length }],
});
