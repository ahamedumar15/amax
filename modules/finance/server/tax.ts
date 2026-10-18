export type TaxLine = { code: string; label: string; rate: string; base: string; amount: string };
export type Treatment = "standard" | "export";

type Rule = { code: string; label: string; bp: bigint; onPrevious?: boolean };

const RULES: Record<string, Rule[]> = {
  AU: [{ code: "gst", label: "GST 10%", bp: 1000n }],
  LK: [{ code: "sscl", label: "SSCL 2.5%", bp: 250n }, { code: "vat", label: "VAT 18%", bp: 1800n, onPrevious: true }],
};
const EXPORT: Record<string, string> = { AU: "GST-free export", LK: "Zero-rated export (VAT 0%)" };

const cents = (v: string) => {
  const [w, f = ""] = v.replace("-", "").split(".");
  const c = BigInt(w + f.padEnd(2, "0").slice(0, 2));
  return v.startsWith("-") ? -c : c;
};
const fromCents = (c: bigint) => {
  const a = c < 0n ? -c : c;
  return `${c < 0n ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
const pct = (base: bigint, bp: bigint) => {
  const x = base * bp;
  const q = (x < 0n ? -x : x) / 10_000n + (((x < 0n ? -x : x) % 10_000n) >= 5_000n ? 1n : 0n);
  return x < 0n ? -q : q;
};

export const taxLabel = (country: string, treatment: Treatment) =>
  treatment === "export" ? (EXPORT[country] ?? "No tax") : (RULES[country] ?? []).map((r) => r.label).join(" + ") || "No tax";

export function taxFor(country: string, treatment: Treatment, subtotal: string): { lines: TaxLine[]; tax: string; total: string } {
  const sub = cents(subtotal);
  const lines: TaxLine[] = [];
  let carried = 0n;
  for (const r of treatment === "export" ? [] : (RULES[country] ?? [])) {
    const base = r.onPrevious ? sub + carried : sub;
    const amount = pct(base, r.bp);
    carried += amount;
    lines.push({ code: r.code, label: r.label, rate: `${Number(r.bp) / 100}`, base: fromCents(base), amount: fromCents(amount) });
  }
  return { lines, tax: fromCents(carried), total: fromCents(sub + carried) };
}
