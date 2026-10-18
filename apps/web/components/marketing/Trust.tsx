const POINTS = [
  ["Every write attributed", "A person, or an agent acting for them"],
  ["Tamper-evident audit", "Hash-chained trail with evidence export"],
  ["Role-scoped MCP", "Same permissions in chat, UI and API"],
  ["Your region, your data", "Region pinning, retention and legal holds"],
  ["Accessible", "WCAG 2.2 AA, light and dark"],
];

export function Trust() {
  return (
    <section id="trust" className="mk-band" aria-labelledby="mk-trust">
      <h2 id="mk-trust" className="sr">Trust and security</h2>
      <ul>{POINTS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ul>
    </section>
  );
}
