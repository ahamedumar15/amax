import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

// 062: AMAX_SALES_EMAIL and AMAX_BASE_URL are runtime settings (one image, many deployments), so render per request.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/$", "/welcome", "/marketing/", "/_next/"], disallow: "/" }, sitemap: `${siteUrl()}/sitemap.xml` };
}
