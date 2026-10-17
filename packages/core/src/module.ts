import type { ComponentType } from "react";
import type { IconName } from "@amax/ui";

export type ModuleRoute = { path: string; title: string; component: ComponentType };

export type ModuleManifest = {
  id: string;
  title: string;
  icon: IconName;
  group: "Work" | "People" | "Business" | "Operations";
  order?: number;
  primary?: boolean;
  dependsOn?: string[];
  integratesWith?: string[];
  permissions?: string[];
  routes: ModuleRoute[];
  mcpTools?: unknown[];
  chatIntents?: unknown[];
  jobs?: unknown[];
  fixtures?: unknown[];
};

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) throw new Error(`module id "${manifest.id}" must be kebab-case`);
  if (!manifest.routes.some((r) => r.path === "")) throw new Error(`module "${manifest.id}" needs a root route ("")`);
  return manifest;
}
