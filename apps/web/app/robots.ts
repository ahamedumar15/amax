import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { knownOrigin } from "../lib/site";

// 062: AMAX_BASE_URL is a runtime setting (one image, many deployments), so render per request.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = knownOrigin(await headers());
  const rules = { userAgent: "*", allow: ["/$", "/welcome", "/signin", "/icon.svg", "/marketing/", "/_next/"], disallow: "/" };
  return origin ? { rules, sitemap: `${origin}/sitemap.xml` } : { rules };
}
