import { TILES } from "./copy";

export function AuditTiles() {
  return (
    <section id="security" className="wrap tiles" aria-labelledby="audit-title">
      <div className="tile head"><h2 id="audit-title">Built for audit</h2><span>Facts about how amax works, not claims about customers.</span></div>
      {TILES.map(([t, d]) => <div key={t} className="tile"><b>{t}</b><span>{d}</span></div>)}
    </section>
  );
}
