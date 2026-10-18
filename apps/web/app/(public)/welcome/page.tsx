import type { Metadata } from "next";
import { loadEnv } from "@amax/core/env";
import { MarketingBar } from "../../../components/marketing/MarketingBar";
import { Hero } from "../../../components/marketing/Hero";
import { Problem } from "../../../components/marketing/Problem";
import { HowItWorks } from "../../../components/marketing/HowItWorks";
import { Features } from "../../../components/marketing/Features";
import { Trust } from "../../../components/marketing/Trust";
import { ChatPreview } from "../../../components/marketing/ChatPreview";
import { Closing } from "../../../components/marketing/Closing";
import { Sprite } from "../../../components/marketing/Art";
import "./welcome.css";

export const metadata: Metadata = {
  title: { absolute: "amax · Agents keep the records. People decide." },
  description: "amax is the agent-native ERP for software and professional-services firms. Agents log time, move releases and keep HR, payroll and billing current through MCP. People review and decide.",
};

export default function WelcomePage() {
  const salesEmail = loadEnv().AMAX_SALES_EMAIL;
  return (
    <div className="mk">
      <a className="mk-skip" href="#main">Skip to content</a>
      <Sprite />
      <MarketingBar salesEmail={salesEmail} />
      <main id="main">
        <Hero salesEmail={salesEmail} />
        <Problem />
        <HowItWorks />
        <Features />
        <Trust />
        <ChatPreview />
        <Closing salesEmail={salesEmail} />
      </main>
      <footer className="mk-foot"><span>© 2026 amax</span><a href="/signin">Sign in</a></footer>
    </div>
  );
}
