import { notFound } from "next/navigation";
import { can } from "@amax/auth";
import { findRoute } from "../../../../lib/registry";
import { getViewer } from "../../../../lib/viewer";

type Params = { params: Promise<{ module: string; path?: string[] }> };

export async function generateMetadata({ params }: Params) {
  const { module, path } = await params;
  return { title: findRoute(module, path)?.route.title ?? "Not found" };
}

export default async function ModulePage({ params }: Params) {
  const { module, path } = await params;
  const found = findRoute(module, path);
  if (!found) notFound();
  // Screens a role may not open don't exist for it, same as the hidden nav entry.
  const viewer = await getViewer();
  if (viewer && !can(viewer, `${module}:read`)) notFound();
  const Screen = found.route.component;
  return <Screen />;
}
