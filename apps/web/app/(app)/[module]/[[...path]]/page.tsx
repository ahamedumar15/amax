import { notFound } from "next/navigation";
import { findRoute } from "../../../../lib/registry";

type Params = { params: Promise<{ module: string; path?: string[] }> };

export async function generateMetadata({ params }: Params) {
  const { module, path } = await params;
  return { title: findRoute(module, path)?.route.title ?? "Not found" };
}

export default async function ModulePage({ params }: Params) {
  const { module, path } = await params;
  const found = findRoute(module, path);
  if (!found) notFound();
  const Screen = found.route.component;
  return <Screen />;
}
