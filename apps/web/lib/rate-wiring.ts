import { configureRateLimits, limitsFromEnv, type Limited } from "@amax/core/server";
import type { loadEnv } from "@amax/core/env";

/** The limits from AMAX_RATE_* and the sink that records 429s in api.rate_limited (035 AC-5). Every
 * bundle that limits requests calls it, the proxy included, wherever the host runs it (review 058). */
export function wireRateLimits(env: ReturnType<typeof loadEnv>, sink: (l: Limited) => void) {
  configureRateLimits({ ...limitsFromEnv(env), sink });
}
