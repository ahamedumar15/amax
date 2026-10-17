import { CONNECTORS, REVOKE_REASONS, type ConnectorId } from "@amax/core/secrets";
import { putSecretAction, revokeSecretAction } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That didn't save: check the value and the expiry date.",
  nokms: "That didn't save: no key service is configured on the server.",
  failed: "That didn't save. Try again.",
};
const GRACE = [[0, "No overlap, stop it now"], [24, "1 day"], [72, "3 days"], [168, "7 days"]] as const;

type Props = { mode: "add" | "rotate"; connector?: ConnectorId; choices: ConnectorId[]; error?: string };

export function KeyForm({ mode, connector, choices, error }: Props) {
  const title = mode === "rotate" && connector ? `Rotate ${CONNECTORS[connector].name}` : "Add credential";
  return (
    <section className="card keyform" aria-labelledby="keyform-h">
      <div className="card-head"><h2 id="keyform-h">{title}</h2><a className="btn sm" href="/settings/keys">Cancel</a></div>
      {error && <p className="viewbanner" role="alert">{ERRORS[error] ?? ERRORS.failed}</p>}
      <form action={putSecretAction} className="fields">
        <input type="hidden" name="mode" value={mode} />
        {mode === "rotate" && connector ? <input type="hidden" name="connector" value={connector} /> : (
          <label>Connector <select className="select" name="connector" required>{choices.map((c) => <option key={c} value={c}>{CONNECTORS[c].name}</option>)}</select></label>
        )}
        <label>{mode === "rotate" ? "New value" : "Value"} <input className="select" type="password" name="value" required autoComplete="off" spellCheck={false} /></label>
        <label>Expires <input className="select" type="date" name="expiresAt" /></label>
        {mode === "rotate" && (
          <label>Keep the old value working for <select className="select" name="graceHours" defaultValue="72">{GRACE.map(([h, t]) => <option key={h} value={h}>{t}</option>)}</select></label>
        )}
        <p className="muted">The value is encrypted with your key and can never be shown again, to anyone.</p>
        <button className="btn primary" type="submit">{mode === "rotate" ? "Rotate" : "Save credential"}</button>
      </form>
      {mode === "rotate" && connector && (
        <form action={revokeSecretAction} className="fields revoke">
          <input type="hidden" name="connector" value={connector} />
          <label>Reason <select className="select" name="reason">{REVOKE_REASONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></label>
          <button className="btn danger" type="submit">Revoke now</button>
        </form>
      )}
    </section>
  );
}
