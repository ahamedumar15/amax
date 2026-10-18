import { PinButton } from "@amax/ui";

export function PurgedCard({ purged }: { purged: { label: string; n: number }[] }) {
  const pin = { label: "Purged last 30 days", tool: "retention_purge_history", args: { days: 30 } };
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Purged last 30 days</h2><PinButton inline pin={pin} /><span className="muted" style={{ fontSize: 13 }}>By class, never by value</span></div>
      {purged.length === 0 ? <p className="muted">Nothing was due in the last 30 days.</p> : purged.map((p) => (
        <div key={p.label} className="row line"><span>{p.label}</span><span className="r"><b>{p.n.toLocaleString("en")}</b><PinButton inline pin={{ ...pin, label: `${p.label} purged`, args: { days: 30, label: p.label } }} /></span></div>
      ))}
    </div>
  );
}
