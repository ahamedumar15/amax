import { NextResponse, type NextRequest } from "next/server";
import { gate } from "@amax/auth/gate";
import { auth } from "./auth";

const enabled = Boolean(process.env.DATABASE_URL);

// Signed-out visitors are sent to /signin. Without a database the app is a guest preview.
export const proxy = enabled
  ? auth((req) => {
      const to = gate(req.nextUrl, Boolean(req.auth));
      return to ? NextResponse.redirect(to) : NextResponse.next();
    })
  : (_req: NextRequest) => NextResponse.next();

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico|css|js)$).*)"] };
