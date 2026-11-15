import { ToolError, type RegisteredTool } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import type { CardForm } from "@amax/core";

export type Edits = Record<string, string>;
export type FieldCheck = { field?: string; message?: string };

export function withEdits(form: CardForm, input: Record<string, unknown>, edits: Edits = {}): Record<string, unknown> {
  const next = { ...input };
  for (const f of form.fields) {
    if (!(f.name in edits)) continue;
    const value = String(edits[f.name] ?? "").trim();
    if (value) next[f.name] = value;
    else delete next[f.name];
  }
  return next;
}

export async function checkInput(t: RegisteredTool, viewer: Viewer, input: Record<string, unknown>, typing = false): Promise<{ value: Record<string, unknown> } | { refused: FieldCheck }> {
  const parsed = (typing ? t.draft ?? t.input : t.input).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] === undefined ? undefined : String(issue.path[0]);
    return { refused: { field, message: field && input[field] === undefined ? "Fill this in" : issue?.message ?? "check the fields" } };
  }
  const value = parsed.data as Record<string, unknown>;
  try {
    await t.propose?.(viewer as never, value as never);
  } catch (e) {
    if (e instanceof ToolError && e.code === "invalid_input") return { refused: { field: e.field, message: e.message } };
    throw e;
  }
  return { value };
}
