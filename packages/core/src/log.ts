import { randomUUID } from "node:crypto";

// Server error logging without content (review round 1, B8). Error messages can quote request
// bodies (JSON SyntaxError), user text or model output, so only the error's class, its code and a
// request id reach the log; the id is returned so the response can carry it for support.
const oneWord = (s: string) => s.replace(/[^\w.:-]/g, "_");

export function logError(scope: string, e: unknown): string {
  const id = randomUUID();
  const name = e instanceof Error ? e.name : typeof e;
  const code = typeof e === "object" && e !== null && "code" in e ? oneWord(String((e as { code: unknown }).code)).slice(0, 40) : undefined;
  // 114: one line whatever a caller or an error holds: only letters, digits and .:_- reach the log.
  console.error(`amax ${oneWord(scope)}: ${oneWord(name)}${code ? ` ${code}` : ""} [${id}]`);
  return id;
}
