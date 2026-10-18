import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { knownOrigin } from "../lib/site";

// 062: AMAX_BASE_URL is a runtime setting (one image, many deployments), so render per request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = knownOrigin(await headers());
  return origin ? [{ url: `${origin}/`, changeFrequency: "monthly", priority: 1 }] : [];
}
