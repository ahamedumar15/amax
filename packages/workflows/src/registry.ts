import type { ScheduleDef, WorkflowDef } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkflow = WorkflowDef<any, any>;
export type WorkflowRegistry = { workflows: Map<string, AnyWorkflow>; schedules: Map<string, ScheduleDef> };
type Contributor = { id: string; workflows?: readonly unknown[]; schedules?: readonly unknown[] };

// Builds the registry from installed manifests: names are unique and every schedule names a
// registered workflow, so a typo fails at boot instead of at 06:00 on a Monday.
export function workflowRegistry(manifests: readonly Contributor[]): WorkflowRegistry {
  const workflows = new Map<string, AnyWorkflow>();
  const schedules = new Map<string, ScheduleDef>();
  for (const m of manifests) {
    for (const w of (m.workflows ?? []) as AnyWorkflow[]) {
      if (workflows.has(w.name)) throw new Error(`workflow "${w.name}" is declared twice`);
      workflows.set(w.name, w);
    }
    for (const s of (m.schedules ?? []) as ScheduleDef[]) {
      if (schedules.has(s.name)) throw new Error(`schedule "${s.name}" is declared twice`);
      schedules.set(s.name, s);
    }
  }
  for (const s of schedules.values()) {
    if (!workflows.has(s.workflow)) throw new Error(`schedule "${s.name}" runs unknown workflow "${s.workflow}"`);
  }
  return { workflows, schedules };
}

export function workflowOf(registry: WorkflowRegistry, name: string): AnyWorkflow {
  const def = registry.workflows.get(name);
  if (!def) throw new Error(`no installed module declares workflow "${name}"`);
  return def;
}
