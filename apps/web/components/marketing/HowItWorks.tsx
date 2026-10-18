import { STEPS } from "./copy";

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
