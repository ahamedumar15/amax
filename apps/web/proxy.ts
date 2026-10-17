import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { gate, isPublicPath } from "@amax/auth/gate";
import { sessionStamp } from "@amax/auth/authjs";
import { countsAsPage, ensureRateLimits, limitsFromEnv, takeRate } from "@amax/core/rate-limit";
import { loadEnv } from "@amax/core/env";
import { auth } from "./auth";

type Handler = (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

// The limiter's state is shared with the app's bundle (core/rate-limit keeps it on globalThis), so the
// app's sink records page 429s too. Until the app has wired it, the proxy applies the env limits.
if (process.env.DATABASE_URL) ensureRateLimits(limitsFromEnv(loadEnv()));

// With a lazily configured NextAuth, auth(fn) resolves to the wrapped handler.
const guarded: Promise<Handler> | null = process.env.DATABASE_URL
  ? (auth((req) => {
      const to = gate(req.nextUrl, Boolean(req.auth));
      if (to) return NextResponse.redirect(to);
      // 035 AC-5: pages are limited per user and tenant, like REST and MCP calls. Only navigations
      // count: document loads and the RSC fetch of a client-side navigation (the same work, and
      // skipping it would let any client dodge the limit by sending "rsc: 1"). Prefetches are the
      // router's speculation, not the person's; server actions are counted where their work runs,
      // per tool call in the registry.
      const stamp = sessionStamp(req.auth);
      const r = stamp?.tenantId && countsAsPage(req.headers) ? takeRate({ tenantId: stamp.tenantId, userId: stamp.userId, channel: "page" }) : { ok: true as const };
      return r.ok ? NextResponse.next() : new NextResponse("Too many requests. Wait a moment and try again.", { status: 429, headers: { "retry-after": String(r.retryAfter) } });
    }) as unknown as Promise<Handler>)
  : null;

// Signed-out visitors are sent to /signin. Without a database the app is a guest preview.
export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (!guarded || isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  return (await guarded)(req, ev);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico|css|js)$).*)"] };
