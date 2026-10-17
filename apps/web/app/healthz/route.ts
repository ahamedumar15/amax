import { installed } from "../../lib/registry";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, modules: installed.map((m) => m.id) });
}
