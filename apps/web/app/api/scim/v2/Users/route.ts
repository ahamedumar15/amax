import { scimHandler } from "@amax/auth/scim";
import { getDb } from "../../../../../lib/server";

export const dynamic = "force-dynamic";

const handle = (req: Request) => {
  const db = getDb();
  return db ? scimHandler(db, req) : Response.json({ detail: "database not configured" }, { status: 503 });
};

export { handle as GET, handle as POST };
