import { DemoLink } from "./DemoLink";
import { ProductVideo } from "./ProductVideo";

export function Hero({ salesEmail }: { salesEmail?: string }) {
  return (
    <section className="mk-hero" aria-labelledby="mk-title">
      <div>
        <span className="chip">Agent-native ERP for software and services firms</span>
        <h1 id="mk-title">Agents keep the records. People decide.</h1>
        <p>Commits close tasks and log time. Deployments move releases. Payroll, leave and billing stay up to date through chat. Your team opens amax to review and approve, not to type.</p>
        <div className="mk-actions">
          <DemoLink email={salesEmail} primary />
          <a className="btn" href="#how">See how it works</a>
        </div>
      </div>
      <ProductVideo />
    </section>
  );
}
