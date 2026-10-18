import { sql } from "drizzle-orm";
import type { z } from "zod";
import { type Db, textArray, withTenant } from "@amax/db";
import { appendTrace, currentTrace, logError, type Sensitivity, type Source } from "@amax/core/server";
import { blockedReason, loadPolicy, type AiPolicy } from "./policy";
import { DATA_RULES, looksLikeInjection, quoteData } from "./prompt";
import { redactDeep, type Redactions } from "./redact";
import { costOf, type Message, type Provider, type ProviderCall, type ProviderResult, type ToolSpec, type Usage } from "./types";

export type AiConfig = { provider: Provider; db: Db; model: string; fallbackModel?: string };
let config: AiConfig | undefined;
export const configureAi = (c: AiConfig) => {
  config = c;
};
export const aiConfigured = () => Boolean(config);
const cfg = () => {
  if (!config) throw new AiDisabledError("no AI provider is configured (ANTHROPIC_API_KEY)");
  return config;
};

export class AiDisabledError extends Error {
  constructor(reason: string) {
    super(`AI is off: ${reason}`);
    this.name = "AiDisabledError";
  }
}
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** Who is asking, for the call log and permissions. `userId` and `conversationId` attribute the cost (048); jobs leave them out. */
export type AiCaller = { tenantId: string; caller: string; source: Source; purpose: string; userId?: string; conversationId?: string };

/** Material for the model. Records are redacted by class at every depth; text is quoted as untrusted data. */
export type DataItem = { label: string; text: string } | { label: string; record: unknown; sensitive?: Partial<Record<string, Sensitivity>> };

type Prepared = { policy: AiPolicy; system: string; dataText: string; redactions: Redactions; injection: boolean };

async function prepare(caller: AiCaller, instructions: string, data: DataItem[]): Promise<Prepared> {
  const { db } = cfg();
  const policy = await withTenant(db, caller.tenantId, (tx) => loadPolicy(tx));
  const blocked = blockedReason(policy);
  if (blocked) throw new AiDisabledError(blocked);
  const redactions: Redactions = {};
  const parts = data.map((d) => ("text" in d ? quoteData(d.label, d.text) : quoteData(d.label, JSON.stringify(redactDeep(d.record, d.sensitive ?? {}, policy.allowedClasses, redactions), null, 1))));
  return {
    policy,
    system: `${instructions}\n\n${DATA_RULES}`,
    dataText: parts.join("\n\n"),
    redactions,
    injection: data.some((d) => looksLikeInjection("text" in d ? d.text : JSON.stringify(d.record))),
  };
}

type LogEntry = { model: string; providerModel?: string; policyVersion: number; usage: Usage; redactions: Redactions; injection: boolean; toolsRun?: string[]; ok: boolean; error?: string };

async function log(caller: AiCaller, entry: LogEntry) {
  const { db } = cfg();
  const priced = entry.providerModel ?? entry.model;
  // The error text can quote model output, so only its first line, capped, is kept.
  const error = entry.error ? entry.error.split("\n")[0].slice(0, 200) : null;
  // 050: the call carries its trace id, and the trace gets a model_call step pointing at it.
  const trace = currentTrace();
  const traced = trace?.tenantId === caller.tenantId ? trace : undefined;
  await withTenant(db, caller.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`insert into ai.call (tenant_id, trace_id, user_id, conversation_id, caller, source, purpose, model, provider_model, policy_version, input_tokens, output_tokens, cost_usd, redactions, injection_suspected, tools_run, ok, error)
    values (${caller.tenantId}, ${traced?.traceId ?? null}, ${caller.userId ?? null}, ${caller.conversationId ?? null}, ${caller.caller}, ${caller.source}, ${caller.purpose}, ${entry.model}, ${entry.providerModel ?? null}, ${entry.policyVersion}, ${entry.usage.inputTokens}, ${entry.usage.outputTokens},
            ${costOf(priced, entry.usage)}, ${JSON.stringify(entry.redactions)}::jsonb, ${entry.injection}, ${textArray(entry.toolsRun ?? [])}, ${entry.ok}, ${error}) returning id`);
    if (traced) await appendTrace(tx, traced, { kind: "model_call", recordId: row.id as string, detail: { model: entry.providerModel ?? entry.model, ok: entry.ok } });
  });
}

// Primary model first; the fallback runs when the primary errors, refuses or breaks the schema.
async function callWithFallback(req: Omit<ProviderCall, "model">, accept: (r: ProviderResult) => string | null) {
  const { provider, model, fallbackModel } = cfg();
  const models = [model, ...(fallbackModel && fallbackModel !== model ? [fallbackModel] : [])];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let lastError = "no model ran";
  for (const m of models) {
    try {
      const r = await provider.call({ ...req, model: m });
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      const problem = r.stop === "refusal" ? "the model declined" : r.stop === "max_tokens" ? "the answer was cut off" : accept(r);
      if (!problem) return { result: r, usage, model: m, providerModel: r.model };
      lastError = problem;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { result: null, usage, model: models.at(-1)!, providerModel: undefined as string | undefined, error: lastError };
}

/** Structured extraction: the answer must validate against `schema`, or it's an error. */
export async function extract<T>(caller: AiCaller, opts: { instructions: string; data: DataItem[]; schema: z.ZodType<T>; ask?: string }): Promise<T> {
  const p = await prepare(caller, opts.instructions, opts.data);
  const messages: Message[] = [{ role: "user", content: [{ type: "text", text: `${p.dataText}\n\n${opts.ask ?? "Extract the fields from the data above."}` }] }];
  const out = await callWithFallback({ system: p.system, messages, schema: opts.schema, effort: "low", maxTokens: 4000 }, (r) =>
    opts.schema.safeParse(r.parsed).success ? null : "the answer didn't match the expected shape");
  await log(caller, { model: out.model, providerModel: out.providerModel, policyVersion: p.policy.version, usage: out.usage, redactions: p.redactions, injection: p.injection, ok: Boolean(out.result), error: out.error });
  if (!out.result) throw new AiOutputError(`AI extraction failed: ${out.error}`);
  return opts.schema.parse(out.result.parsed);
}

/** Free-text answer about the data. */
export async function complete(caller: AiCaller, opts: { instructions: string; data: DataItem[]; ask: string }): Promise<string> {
  const p = await prepare(caller, opts.instructions, opts.data);
  const messages: Message[] = [{ role: "user", content: [{ type: "text", text: `${p.dataText}\n\n${opts.ask}` }] }];
  const out = await callWithFallback({ system: p.system, messages, effort: "low", maxTokens: 4000 }, (r) => (r.text.trim() ? null : "empty answer"));
  await log(caller, { model: out.model, providerModel: out.providerModel, policyVersion: p.policy.version, usage: out.usage, redactions: p.redactions, injection: p.injection, ok: Boolean(out.result), error: out.error });
  if (!out.result) throw new AiOutputError(`AI completion failed: ${out.error}`);
  return out.result.text;
}

/** `sensitive` names classified fields in the tool's result, redacted per the tenant's policy. */
export type Tool = ToolSpec & { run: (input: never) => Promise<unknown>; sensitive?: Partial<Record<string, Sensitivity>> };

/**
 * A bounded tool loop for chat (005). Tool inputs are validated with their zod schema before they
 * run; tools run as the caller through module services, so permissions and audit apply.
 */
// Keyed by error name or code: one phrase per kind of failure.
const FAILURES: Record<string, string> = {
  ForbiddenError: "isn't allowed for this user",
  forbidden: "isn't allowed for this user",
  ScopeError: "is outside this user's data scope",
  ZodError: "was given input it doesn't accept",
  invalid_input: "was given input it doesn't accept",
  not_found: "found no such record",
};

/** What the model is told when a tool throws: the kind of failure, never the message. */
export function toolFailure(tool: string, e: unknown, ref: string) {
  const name = e instanceof Error ? e.name : "";
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  // Own keys only: a name or code like "constructor" must not pick up Object.prototype (review round 5).
  const phrase = Object.hasOwn(FAILURES, name) ? FAILURES[name] : Object.hasOwn(FAILURES, code) ? FAILURES[code] : "failed";
  return `${tool} ${phrase} (reference ${ref}).`;
}

export async function converse(caller: AiCaller, opts: { instructions: string; messages: Message[]; tools: Tool[]; data?: DataItem[]; maxSteps?: number }) {
  const p = await prepare(caller, opts.instructions, opts.data ?? []);
  const messages: Message[] = [...opts.messages];
  if (p.dataText) {
    const first = messages[0];
    if (first?.role === "user") messages[0] = { role: "user", content: [{ type: "text", text: `Pinned context:\n${p.dataText}` }, ...first.content] };
  }
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const toolsRun: string[] = [];
  let model = cfg().model;
  let providerModel: string | undefined;
  try {
    for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
      const out = await callWithFallback({ system: p.system, messages, tools: opts.tools, effort: "medium", maxTokens: 8000 }, () => null);
      usage.inputTokens += out.usage.inputTokens;
      usage.outputTokens += out.usage.outputTokens;
      model = out.model;
      providerModel = out.providerModel;
      if (!out.result) throw new AiOutputError(`AI chat failed: ${out.error}`);
      messages.push(out.result.assistant);
      if (out.result.stop !== "tool_use") {
        await log(caller, { model, providerModel, policyVersion: p.policy.version, usage, redactions: p.redactions, injection: p.injection, toolsRun, ok: true });
        // 006: an agent run records its cost per step; null when the model has no known price.
        return { messages, text: out.result.text, toolsRun, usage, costUsd: costOf(providerModel ?? model, usage) };
      }
      const results = await Promise.all(out.result.toolCalls.map(async (call) => {
        const tool = opts.tools.find((t) => t.name === call.name);
        const parsed = tool?.input.safeParse(call.input);
        if (!tool || !parsed?.success) return { type: "tool_result" as const, toolUseId: call.id, content: `invalid call to ${call.name}`, isError: true };
        toolsRun.push(call.name);
        try {
          // Tool results are data too: redacted by class, quoted, and checked for injection like any input.
          const result = JSON.stringify(redactDeep(await tool.run(parsed.data as never), tool.sensitive ?? {}, p.policy.allowedClasses, p.redactions));
          if (looksLikeInjection(result)) p.injection = true;
          return { type: "tool_result" as const, toolUseId: call.id, content: quoteData(`result of ${call.name}`, result) };
        } catch (e) {
          // Error messages can echo record values (classified or not) and attacker text, and can't be
          // redacted by field. The model gets a fixed string by error kind. logError records only the
          // error's name, code and a reference, never its message (review rounds 2 to 4).
          return { type: "tool_result" as const, toolUseId: call.id, content: toolFailure(call.name, e, logError(`ai.tool ${call.name}`, e)), isError: true };
        }
      }));
      messages.push({ role: "user", content: results });
    }
    throw new AiOutputError("AI chat used too many steps");
  } catch (e) {
    await log(caller, { model, providerModel, policyVersion: p.policy.version, usage, redactions: p.redactions, injection: p.injection, toolsRun, ok: false, error: e instanceof Error ? e.name : "error" });
    throw e;
  }
}
