import { describe, expect, it } from "vitest";
import { addMoney, compareMoney, moneyOf, subMoney, sumMoney } from "../src/money";

describe("AC-2 money", () => {
  it("adds exactly, without float error", () => {
    expect(addMoney(moneyOf("0.1", "USD"), moneyOf("0.2", "USD"))).toEqual({ amount: "0.3000", currency: "USD" });
    expect(sumMoney([moneyOf(320000, "USD"), moneyOf(180000, "USD"), moneyOf(96000, "USD")], "USD").amount).toBe("596000.0000");
  });
  it("handles negatives and comparison", () => {
    expect(subMoney(moneyOf("1.5", "LKR"), moneyOf("2.25", "LKR")).amount).toBe("-0.7500");
    expect(compareMoney(moneyOf(1, "AUD"), moneyOf("0.9999", "AUD"))).toBe(1);
  });
  it("refuses to mix currencies or lose precision", () => {
    expect(() => addMoney(moneyOf(1, "USD"), moneyOf(1, "AUD"))).toThrow(/USD and AUD/);
    expect(() => moneyOf("1.00001", "USD")).toThrow(/decimal places/);
    expect(() => moneyOf("1e5", "USD")).toThrow(/not a decimal/);
  });
});
