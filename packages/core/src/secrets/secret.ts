import { inspect } from "node:util";
import { hide } from "./forms";

const HIDDEN = "[secret]";

export class Secret {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal() {
    return this.#value;
  }
  toString() {
    return HIDDEN;
  }
  toJSON() {
    return HIDDEN;
  }
  [inspect.custom]() {
    return HIDDEN;
  }
}

export class SecretLeakError extends Error {
  readonly retryable = false;
  constructor(connector: string) {
    super(`secrets: the ${connector} credential value was about to leave useSecret, or the result was not plain JSON data (strings, numbers, booleans, null, arrays, plain objects) that could be checked; it was withheld`);
    this.name = "SecretLeakError";
  }
}

const KEPT = ["code", "status", "retryable"] as const;

export function scrubError(e: unknown, values: string[]): Error {
  const source = e instanceof Error ? e : new Error(typeof e === "string" ? e : "connector call failed");
  const clean = new Error(hide(source.message, values));
  clean.name = hide(source.name, values);
  clean.stack = hide(source.stack ?? "", values);
  for (const k of KEPT) {
    const v = (source as unknown as Record<string, unknown>)[k];
    if (["string", "number", "boolean"].includes(typeof v)) Object.assign(clean, { [k]: typeof v === "string" ? hide(v, values) : v });
  }
  return clean;
}

function plainEntries(value: object): unknown[] | null {
  const proto = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return null;
  const keys = Reflect.ownKeys(value).filter((k) => !(Array.isArray(value) && k === "length"));
  const props = keys.map((k) => Object.getOwnPropertyDescriptor(value, k)!);
  if (keys.some((k) => typeof k !== "string") || props.some((d) => !d.enumerable || !("value" in d))) return null;
  return [...keys, ...props.map((d) => d.value)];
}

function leaks(value: unknown, values: string[], seen: Set<object>): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return hide(value, values) !== value;
  if (typeof value === "number") return !Number.isFinite(value) || hide(String(value), values) !== String(value);
  if (typeof value !== "object") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  const parts = plainEntries(value);
  return parts === null || parts.some((p) => leaks(p, values, seen));
}

export function assertNoLeak<T>(result: T, values: string[], connector: string): T {
  if (leaks(result, values, new Set())) throw new SecretLeakError(connector);
  return result;
}
