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
    super(`secrets: the ${connector} credential value was about to leave useSecret, or the result was not plain data that could be checked; it was withheld`);
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

const PLAIN = new Set<unknown>([Object.prototype, null, Array.prototype, Map.prototype, Set.prototype, Date.prototype]);
const bytesText = (b: ArrayBuffer | ArrayBufferView) => (ArrayBuffer.isView(b) ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : Buffer.from(b)).toString("latin1");

function partsOf(value: object): unknown[] | null {
  if (value instanceof Error) return [value.name, value.message, value.stack, value.cause, ...Object.values(value)];
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return [bytesText(value)];
  if (!PLAIN.has(Object.getPrototypeOf(value))) return null;
  if (value instanceof Map) return [...value.keys(), ...value.values()];
  if (value instanceof Set) return [...value];
  return Reflect.ownKeys(value).flatMap((k) => [typeof k === "string" ? k : k.description, (value as Record<PropertyKey, unknown>)[k]]);
}

function leaks(value: unknown, values: string[], seen: Set<object>): boolean {
  if (typeof value === "string") return hide(value, values) !== value;
  if (typeof value === "function" || value instanceof Secret) return true;
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const parts = partsOf(value);
  return parts === null || parts.some((p) => leaks(p, values, seen));
}

export function assertNoLeak<T>(result: T, values: string[], connector: string): T {
  if (leaks(result, values, new Set())) throw new SecretLeakError(connector);
  return result;
}
