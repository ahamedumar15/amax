import { z } from "zod";
import { aiConfigured, extract } from "@amax/ai";

export const Fields = z.object({
  merchant: z.string().min(2).max(120), spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3), category: z.string().min(2).max(40),
});
export type Fields = z.infer<typeof Fields>;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const HINTS: [RegExp, string][] = [[/taxi|uber|pickme|fuel|parking|train|bus|flight|airline|toll/i, "travel"], [/restaurant|cafe|coffee|lunch|dinner|meal|food|bakery/i, "meals"],
  [/pharmacy|clinic|hospital|medical|dental|channelling/i, "medical"], [/course|exam|training|udemy|certif|conference/i, "training"], [/laptop|monitor|dock|keyboard|mouse|cable|headset/i, "equipment"]];

function dayIn(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const named = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\b/i);
  return named ? `${named[3]}-${String(MONTHS.indexOf(named[2].toLowerCase()) + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}` : null;
}

/** Reads a receipt's text without AI: the first line is the merchant, the TOTAL line the amount. Null when it can't find both. */
export function readReceipt(text: string, fallbackCurrency: string): Fields | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const total = text.match(/\b(?:grand\s+)?total\b[^\d\n]*?([A-Z]{3})?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const spentOn = dayIn(text);
  if (!lines.length || !total || !spentOn) return null;
  const amount = Number(total[2].replace(/,/g, "")).toFixed(2).replace(/\.00$/, "");
  const category = HINTS.find(([re]) => re.test(text))?.[1] ?? "travel";
  return Fields.parse({ merchant: lines[0].slice(0, 120), spentOn, amount, currency: (total[1] ?? fallbackCurrency).toUpperCase(), category });
}

/** The parser first; the AI gateway (033) only when the parser can't read it and AI is on. The text is untrusted data. */
export async function receiptFields(tenantId: string, text: string, currency: string): Promise<{ fields: Fields; by: "parser" | "ai" } | null> {
  const parsed = readReceipt(text, currency);
  if (parsed) return { fields: parsed, by: "parser" };
  if (!aiConfigured()) return null;
  const fields = await extract({ tenantId, caller: "expenses.receipt-agent", source: "agent", purpose: "Read an expense receipt" }, {
    instructions: `Read the receipt and give the merchant, the day (YYYY-MM-DD), the total paid, its currency (default ${currency}) and one category: travel, meals, equipment, training or medical.`,
    data: [{ label: "Receipt text", text }], schema: Fields,
  }).catch(() => null);
  return fields ? { fields, by: "ai" } : null;
}
