import { DemoLink } from "./DemoLink";

export function Closing({ salesEmail }: { salesEmail?: string }) {
  return (
    <section className="mk-cta" aria-labelledby="mk-cta">
      <h2 id="mk-cta">Stop typing updates. Start deciding.</h2>
      <p>See amax on your own delivery data in 30 minutes.</p>
      {salesEmail ? <DemoLink email={salesEmail} primary /> : <a className="btn primary" href="/signin">Sign in</a>}
    </section>
  );
}
