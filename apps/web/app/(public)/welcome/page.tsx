import type { Metadata } from "next";
import { loadEnv } from "@amax/core/env";
import { MarketingBar } from "../../../components/marketing/MarketingBar";
import { Hero } from "../../../components/marketing/Hero";
import { ProductVideo } from "../../../components/marketing/ProductVideo";
import { Statement } from "../../../components/marketing/Statement";
import { HowItWorks } from "../../../components/marketing/HowItWorks";
import { Board } from "../../../components/marketing/Board";
import { Bands } from "../../../components/marketing/Bands";
import { AuditTiles } from "../../../components/marketing/AuditTiles";
import { Faq } from "../../../components/marketing/Faq";
import { Closing } from "../../../components/marketing/Closing";
import { Footer } from "../../../components/marketing/Footer";
import { DESCRIPTION } from "../../../components/marketing/copy";
import { headers } from "next/headers";
import { knownOrigin } from "../../../lib/site";
import "./welcome.css";
import "./sections.css";

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
    <div className="m2">
      <a className="mk-skip" href="#main">Skip to content</a>
      <MarketingBar salesEmail={salesEmail} />
      <main id="main">
        <Hero salesEmail={salesEmail} />
        <ProductVideo />
        <Statement />
        <HowItWorks />
        <Board />
        <Bands />
        <AuditTiles />
        <Faq />
        <Closing salesEmail={salesEmail} />
      </main>
      <Footer />
    </div>
  );
}
