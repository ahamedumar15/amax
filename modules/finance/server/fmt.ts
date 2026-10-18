const formats = new Map<string, Intl.NumberFormat>();

export function money(amount: string, currency: string) {
  const exact = /\.\d*[1-9]/.test(amount);
  const key = `${currency}:${exact}`;
  if (!formats.has(key)) formats.set(key, new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: exact ? 2 : 0, maximumFractionDigits: 2 }));
  return formats.get(key)!.format(Number(amount));
}

export const thousands = (amount: string, currency: string) => `${money(String(Math.round(Number(amount) / 1000)), currency)}k`;
export const percent = (part: string, whole: string) => (Number(whole) ? Math.round((Number(part) / Number(whole)) * 100) : 0);
export const plural = (n: number, one: string, many = `${one}s`) => `${n === 1 ? "one" : n} ${n === 1 ? one : many}`;
export const compact = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 }).format(Number(amount)).replace(/K$/, "k");
