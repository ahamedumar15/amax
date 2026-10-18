import { HERO_LEDE } from "./copy";
import { DemoLink } from "./DemoLink";
import { Queue } from "./Queue";

export function Hero({ salesEmail }: { salesEmail?: string }) {
  return (
    <section className="wrap hero" aria-labelledby="mk-title">
      <div>
        <h1 id="mk-title">Agents keep the records. People decide.</h1>
        <p className="sub">{HERO_LEDE}</p>
        <div className="acts">
          <DemoLink email={salesEmail} primary />
          <a className="btn2 b-soft" href="#tour"><span aria-hidden="true">▶</span> Watch the 35-second tour</a>
        </div>
      </div>
      <Queue />
    </section>
  );
}
