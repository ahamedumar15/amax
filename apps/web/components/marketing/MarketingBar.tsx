import { Logo } from "@amax/ui";
import { DemoLink } from "./DemoLink";
import { ThemeToggle } from "./ThemeToggle";

export function MarketingBar({ salesEmail }: { salesEmail?: string }) {
  return (
    <header className="hdr">
      <div className="wrap">
        <a className="brand" href="/" aria-label="amax home"><Logo /><b>amax</b></a>
        <nav aria-label="Marketing">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </nav>
        <ThemeToggle />
        <a className="m2signin" href="/signin">Sign in</a>
        <DemoLink email={salesEmail} primary />
      </div>
    </header>
  );
}
