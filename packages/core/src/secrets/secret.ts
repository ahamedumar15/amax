import { inspect } from "node:util";
import { isDeepStrictEqual } from "node:util";
import { redact, reveals } from "./forms";

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
    super(`secrets: the ${connector} credential value was about to leave useSecret, so the result was withheld`);
    this.name = "SecretLeakError";
  }
}

export class SecretResultError extends Error {
  readonly retryable = false;
  constructor(connector: string) {
    super(`secrets: a ${connector} useSecret callback must return plain JSON data (strings, finite numbers, booleans, null, arrays, plain objects); its result was refused`);
    this.name = "SecretResultError";
  }
}

const KEPT = ["code", "status", "retryable"] as const;

export function scrubError(e: unknown, values: string[]): Error {
  const source = e instanceof Error ? e : new Error(typeof e === "string" ? e : "connector call failed");
  const clean = new Error(redact(source.message, values));
  clean.name = redact(source.name, values);
  clean.stack = redact(source.stack ?? "", values);
  for (const k of KEPT) {
    const v = (source as unknown as Record<string, unknown>)[k];
    if (["string", "number", "boolean"].includes(typeof v)) Object.assign(clean, { [k]: typeof v === "string" ? redact(v, values) : v });
  }
  return clean;
}

const stringsOf = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v !== null && typeof v === "object" ? Object.values(v).flatMap(stringsOf) : [];

export function checkedCopy<T>(result: T, values: string[], connector: string): T {
  let text: string | undefined;
  try {
    text = JSON.stringify(result);
  } catch {
    throw new SecretResultError(connector);
  }
  if (text === undefined && result === undefined) return result;
  if (text === undefined) throw new SecretResultError(connector);
  const copy = JSON.parse(text) as T;
  if (reveals(text, values) || stringsOf(copy).some((t) => reveals(t, values))) throw new SecretLeakError(connector);
  if (!isDeepStrictEqual(copy, result)) throw new SecretResultError(connector);
  return copy;
}
