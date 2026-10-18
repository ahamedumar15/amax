import { STEPS } from "./copy";
import { HowStage } from "./HowStage";

export function HowItWorks() {
  return (
    <section id="how" className="wrap how" aria-labelledby="how-title">
      <div>
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => <li key={s.title} className="step" data-step={i}><b>{s.title}</b><span>{s.body}</span></li>)}
        </ol>
      </div>
      <HowStage />
    </section>
  );
}
