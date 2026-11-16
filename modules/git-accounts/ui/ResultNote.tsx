import { RESULTS, type ResultCode } from "../words";

// 108 AC-11: the return from GitHub, said in a live region so a screen reader hears it on arrival. Final pass: only a known
// code from the URL picks fixed words, the login and count come from the stored record, and an unknown code says nothing.
export function ResultNote({ result, skipped, connectedAs }: { result?: string; skipped?: string; connectedAs?: { logins: string[]; emails: number } }) {
  if (!result || !Object.hasOwn(RESULTS, result)) return null;
  const code = result as ResultCode;
  // Final pass 2: "connected" is said only when the record shows a connection, whatever the URL claims.
  if (code === "connected" && !connectedAs) return null;
  const ok = code === "connected";
  const others = Number(skipped);
  const detail = ok && connectedAs ? ` as ${connectedAs.logins.map((l) => `@${l}`).join(", ")}: ${connectedAs.emails} email${connectedAs.emails === 1 ? "" : "s"}` : "";
  const more = ok && others > 0 ? `. ${others} more ${others === 1 ? "is" : "are"} linked to another person; ask an Admin` : "";
  return (
    <p role="status" aria-live="polite" className={ok ? "chip good" : "err"} style={{ display: "inline-block", marginBottom: 16 }}>
      {RESULTS[code]}{detail}{more}
    </p>
  );
}
