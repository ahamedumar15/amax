import { inspect } from "node:util";
import { hide, reveals } from "./forms";

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

export function checkedCopy<T>(result: T, values: string[], connector: string): T {
  let text: string | undefined;
  try {
    text = JSON.stringify(result);
  } catch {
    throw new SecretLeakError(connector);
  }
  if (text === undefined) return undefined as T;
  if (reveals(text, values)) throw new SecretLeakError(connector);
  return JSON.parse(text) as T;
}
