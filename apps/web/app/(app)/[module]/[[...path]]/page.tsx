import { notFound } from "next/navigation";
import { can } from "@amax/auth";
import { findRoute, settingsEntries, installed } from "../../../../lib/registry";
import { getViewer } from "../../../../lib/viewer";

type Params = { params: Promise<{ module: string; path?: string[] }>; searchParams?: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: Params) {
  const { module, path } = await params;
  return { title: findRoute(module, path)?.route.title ?? "Not found" };
}

export default async function ModulePage({ params, searchParams }: Params) {
  const { module, path } = await params;
  const found = findRoute(module, path);
  if (!found) notFound();
  // Screens a role may not open don't exist for it, same as the hidden nav entry.
  const viewer = await getViewer();
  if (viewer && !can(viewer, `${module}:read`)) notFound();
  const Screen = found.route.component;
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  // 038 AC-2: a module screen that lives under Settings reads "Settings /" like the platform's own.
  const href = `/${[module, ...(path ?? [])].join("/")}`;
  const setting = settingsEntries(installed).find((e) => href === e.href || href.startsWith(`${e.href}/`));
  const screen = <Screen params={found.params} searchParams={sp} viewer={viewer} />;
  if (!setting) return screen;
  return <><nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>{setting.title}</nav>{screen}</>;
}
