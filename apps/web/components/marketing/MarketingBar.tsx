import { Logo } from "@amax/ui";
import { DemoLink } from "./DemoLink";

export function MarketingBar({ salesEmail }: { salesEmail?: string }) {
  return (
    <header className="mk-bar">
      <a className="mk-brand" href="/" aria-label="amax home"><Logo /><b>amax</b></a>
      <nav aria-label="Marketing">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#trust">Security</a>
        <a href="/signin">Sign in</a>
      </nav>
      <DemoLink email={salesEmail} />
    </header>
  );
}
