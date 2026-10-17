import { metadata } from "@amax/mcp";
import { baseUrl } from "../../../lib/server";
import { json, preflight } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => json(metadata.authorizationServer(baseUrl(req)));
export const OPTIONS = preflight;
