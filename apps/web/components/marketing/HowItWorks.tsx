const STEPS = [
  { title: "Agents write through MCP", body: "Every capability is an MCP tool with role-scoped permissions. Claude Code, CI and your own agents use the same tools as the UI." },
  { title: "amax asks before it changes anything", body: "Each write waits for a confirm, then is permission-checked, audited and attributed to the person or the agent acting for them." },
  { title: "People review and decide", body: "Screens lead with what needs you: approvals, blocked releases and over-allocation. Pin anything into chat and ask." },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="mk-how">
      <h2 id="mk-how">How it works</h2>
      <ol className="mk-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card"><span className="mk-n" aria-hidden="true">{i + 1}</span><h3>{s.title}</h3><p>{s.body}</p></li>
        ))}
      </ol>
    </section>
  );
}
