import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { gate, isPublicPath } from "@amax/auth/gate";
import { sessionStamp } from "@amax/auth/authjs";
import { takeRate } from "@amax/core/rate-limit";
import { auth } from "./auth";

type Handler = (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

// With a lazily configured NextAuth, auth(fn) resolves to the wrapped handler.
const guarded: Promise<Handler> | null = process.env.DATABASE_URL
  ? (auth((req) => {
      const to = gate(req.nextUrl, Boolean(req.auth));
      if (to) return NextResponse.redirect(to);
      // 035 AC-5: pages are limited per user and tenant, like REST and MCP calls.
      const stamp = sessionStamp(req.auth);
      const r = stamp?.tenantId ? takeRate({ tenantId: stamp.tenantId, userId: stamp.userId, channel: "page" }) : { ok: true as const };
      return r.ok ? NextResponse.next() : new NextResponse("Too many requests. Wait a moment and try again.", { status: 429, headers: { "retry-after": String(r.retryAfter) } });
    }) as unknown as Promise<Handler>)
  : null;

// Signed-out visitors are sent to /signin. Without a database the app is a guest preview.
export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (!guarded || isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  return (await guarded)(req, ev);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico|css|js)$).*)"] };
