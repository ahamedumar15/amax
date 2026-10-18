import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

// 062: AMAX_SALES_EMAIL and AMAX_BASE_URL are runtime settings (one image, many deployments), so render per request.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: "monthly", priority: 1 }];
}
