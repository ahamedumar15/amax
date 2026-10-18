import { Mascot } from "@amax/ui";
import { DemoLink } from "./DemoLink";

export function Closing({ salesEmail }: { salesEmail?: string }) {
  return (
    <section className="close" aria-labelledby="mk-cta">
      <div className="wrap">
        <div><h2 id="mk-cta">Ask it yourself.</h2><p>{salesEmail ? "Book a demo and we'll answer this question on a workspace like Lumen Labs, live." : "Sign in and ask it on your own workspace."}</p></div>
        <div className="ask" data-ui>
          <div className="h"><Mascot />Ask amax</div>
          <div className="bub mine">Who is over-allocated next month?</div>
          <div className="bub">Two people are over 100% in November: Sophie Nguyen (120%) and Liam Walsh (110%). Should I suggest moving 20% of Sophie to December?</div>
          <div className="in"><span>Ask, add or drop anything here</span>{salesEmail ? <DemoLink email={salesEmail} primary /> : <a className="btn2 b-act" href="/signin">Sign in</a>}</div>
        </div>
      </div>
    </section>
  );
}
