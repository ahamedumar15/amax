import { inspect } from "node:util";

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
    super(`secrets: the ${connector} credential value was about to leave useSecret; the result was withheld`);
    this.name = "SecretLeakError";
  }
}

export const formsOf = (value: string) => [...new Set([value, Buffer.from(value).toString("base64"), encodeURIComponent(value)])];

const hide = (text: string, values: string[]) => values.reduce((t, v) => t.split(v).join(HIDDEN), text);
const KEPT = ["code", "status", "retryable"] as const;

export function scrubError(e: unknown, values: string[]): Error {
  const source = e instanceof Error ? e : new Error(typeof e === "string" ? e : "connector call failed");
  const clean = new Error(hide(source.message, values));
  clean.name = source.name;
  clean.stack = hide(source.stack ?? "", values);
  for (const k of KEPT) {
    const v = (source as unknown as Record<string, unknown>)[k];
    if (["string", "number", "boolean"].includes(typeof v)) Object.assign(clean, { [k]: typeof v === "string" ? hide(v, values) : v });
  }
  return clean;
}

function serialised(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value) ?? "";
  } catch {
    return inspect(value, { depth: 6 });
  }
}

export function assertNoLeak<T>(result: T, values: string[], connector: string): T {
  const text = serialised(result);
  if (values.some((v) => text.includes(v))) throw new SecretLeakError(connector);
  return result;
}
