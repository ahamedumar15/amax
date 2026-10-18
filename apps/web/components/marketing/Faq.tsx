import { FAQ } from "./copy";

export function Faq() {
  return (
    <section id="faq" className="wrap faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Questions</h2>
      <div>
        {FAQ.map(([q, a], i) => (
          <details key={q} name="mk-faq" open={i === 0}><summary>{q}</summary><p>{a}</p></details>
        ))}
      </div>
    </section>
  );
}
