import { Art } from "./Art";
import { AREAS } from "./areas";

export function Features() {
  return (
    <section id="features" aria-labelledby="mk-features">
      <h2 id="mk-features">One system for delivery, people and money</h2>
      <ul className="mk-grid">
        {AREAS.map((a) => (
          <li key={a.title} className={`mk-f ${a.tone}`}>
            <Art name={a.art} />
            <h3>{a.title}</h3>
            <p>{a.live.map((c) => c.text).join(". ")}.</p>
            {a.coming.length > 0 && <p className="mk-coming"><span className="chip">Coming</span> {a.coming.join(", ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
