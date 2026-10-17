import { char, numeric } from "drizzle-orm/pg-core";

// Money is a numeric amount plus an ISO 4217 code, never a float. `...money("price")` adds
// price_amount numeric(19,4) and price_currency char(3).
export function money<N extends string>(name: N) {
  return {
    [`${name}Amount`]: numeric(`${name}_amount`, { precision: 19, scale: 4 }).notNull(),
    [`${name}Currency`]: char(`${name}_currency`, { length: 3 }).notNull(),
  } as Record<`${N}Amount`, ReturnType<typeof numeric>> & Record<`${N}Currency`, ReturnType<typeof char>>;
}

export type Money = { amount: string; currency: string };

const SCALE = 4;
const toUnits = (amount: string) => {
  if (!/^-?\d+(\.\d+)?$/.test(amount)) throw new Error(`money: "${amount}" is not a decimal amount`);
  const [whole, frac = ""] = amount.replace("-", "").split(".");
  if (frac.length > SCALE) throw new Error(`money: "${amount}" has more than ${SCALE} decimal places`);
  const units = BigInt(whole + frac.padEnd(SCALE, "0"));
  return amount.startsWith("-") ? -units : units;
};
const fromUnits = (units: bigint) => {
  const neg = units < 0n;
  const s = (neg ? -units : units).toString().padStart(SCALE + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -SCALE)}.${s.slice(-SCALE)}`;
};
const same = (a: Money, b: Money) => {
  if (a.currency !== b.currency) throw new Error(`money: can't combine ${a.currency} and ${b.currency}`);
};

export const moneyOf = (amount: string | number, currency: string): Money => ({ amount: fromUnits(toUnits(String(amount))), currency });
export const addMoney = (a: Money, b: Money): Money => (same(a, b), { amount: fromUnits(toUnits(a.amount) + toUnits(b.amount)), currency: a.currency });
export const subMoney = (a: Money, b: Money): Money => (same(a, b), { amount: fromUnits(toUnits(a.amount) - toUnits(b.amount)), currency: a.currency });
export const compareMoney = (a: Money, b: Money) => (same(a, b), Math.sign(Number(toUnits(a.amount) - toUnits(b.amount))));
export const sumMoney = (items: Money[], currency: string) => items.reduce(addMoney, moneyOf(0, currency));
