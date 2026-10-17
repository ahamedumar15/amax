import { scimHandler } from "@amax/auth/scim";
import { getDb } from "../../../../../../lib/server";

export const dynamic = "force-dynamic";

const handle = async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const db = getDb();
  return db ? scimHandler(db, req, (await params).id) : Response.json({ detail: "database not configured" }, { status: 503 });
};

export { handle as GET, handle as PUT, handle as PATCH, handle as DELETE };
