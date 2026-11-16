// 108 AC-11: the return from GitHub, said in a live region so a screen reader hears it on arrival.
export function ResultNote({ result, reason }: { result?: string; reason?: string }) {
  if (!result) return null;
  const ok = result === "connected";
  return (
    <p role="status" aria-live="polite" className={ok ? "chip good" : "err"} style={{ display: "inline-block", marginBottom: 16 }}>
      {ok ? `GitHub connected${reason ? `: ${reason}` : ""}` : `GitHub wasn't connected: ${reason ?? "try again"}`}
    </p>
  );
}
