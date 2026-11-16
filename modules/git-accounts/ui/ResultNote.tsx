import { RESULTS, type ResultCode } from "../words";

/** 112 AC-2: what a link from outside the person's own connect may show: nothing specific. */
export const UNMATCHED = "GitHub wasn't connected. Ask amax to connect GitHub again.";

// 108 AC-11: the return from GitHub, said in a live region so a screen reader hears it on arrival. 112 AC-2: the words come
// from the person's own connect record (its result and skipped count); the URL only asks for the note to be shown.
export function ResultNote({ shown, record, connectedAs }: {
  shown: boolean; record: { result: string; skipped: number } | null; connectedAs?: { logins: string[]; emails: number };
}) {
  if (!shown) return null;
  const known = record && Object.hasOwn(RESULTS, record.result) ? (record.result as ResultCode) : null;
  const ok = known === "connected" && Boolean(connectedAs);
  const text = !known || (known === "connected" && !connectedAs) ? UNMATCHED
    : ok ? `${RESULTS.connected} as ${connectedAs!.logins.map((l) => `@${l}`).join(", ")}: ${connectedAs!.emails} email${connectedAs!.emails === 1 ? "" : "s"}${
      record!.skipped > 0 ? `. ${record!.skipped} more ${record!.skipped === 1 ? "is" : "are"} linked to another person; ask an Admin` : ""}`
    : RESULTS[known];
  return <p role="status" aria-live="polite" className={ok ? "chip good" : "err"} style={{ display: "inline-block", marginBottom: 16 }}>{text}</p>;
}
