import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { gate, isPublicPath } from "@amax/auth/gate";
import { auth } from "./auth";

type Handler = (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

// With a lazily configured NextAuth, auth(fn) resolves to the wrapped handler.
const guarded: Promise<Handler> | null = process.env.DATABASE_URL
  ? (auth((req) => {
      const to = gate(req.nextUrl, Boolean(req.auth));
      return to ? NextResponse.redirect(to) : NextResponse.next();
    }) as unknown as Promise<Handler>)
  : null;

// Signed-out visitors are sent to /signin. Without a database the app is a guest preview.
export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (!guarded || isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  return (await guarded)(req, ev);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico|css|js)$).*)"] };
