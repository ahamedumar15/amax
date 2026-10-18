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
import { DESCRIPTION } from "../../../components/marketing/copy";
import { headers } from "next/headers";
import { knownOrigin } from "../../../lib/site";
import "./welcome.css";

// 062: AMAX_SALES_EMAIL and AMAX_BASE_URL are runtime settings (one image, many deployments), so render per request.
export const dynamic = "force-dynamic";

const TITLE = "amax · Agents keep the records. People decide.";
const IMAGE = { url: "/marketing/amax-og.jpg", width: 1200, height: 630, alt: "amax: Agents keep the records. People decide." };

export async function generateMetadata(): Promise<Metadata> {
  const origin = knownOrigin(await headers());
  const base = { title: { absolute: TITLE }, description: DESCRIPTION };
  if (!origin) return base;
  return {
    ...base,
    metadataBase: new URL(origin),
    alternates: { canonical: "/" },
    openGraph: { type: "website", url: "/", siteName: "amax", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE.url] },
  };
}

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
