import type { Provider, ProviderCall, ProviderResult } from "./types";

// Scripted provider for tests: each step returns a canned result for the request it receives.
export type FakeStep = (req: ProviderCall) => Partial<ProviderResult> & { throw?: string };

export function fakeProvider(steps: FakeStep[] | FakeStep) {
  const calls: ProviderCall[] = [];
  let i = 0;
  const provider: Provider & { calls: ProviderCall[] } = {
    name: "fake",
    calls,
    async call(req) {
      calls.push(structuredClone({ ...req, schema: undefined, tools: req.tools?.map((t) => ({ name: t.name, description: t.description })) }) as ProviderCall);
      const step = Array.isArray(steps) ? steps[Math.min(i++, steps.length - 1)] : steps;
      const r = step(req);
      if (r.throw) throw new Error(r.throw);
      const toolCalls = r.toolCalls ?? [];
      const text = r.text ?? "";
      return {
        model: req.model, stop: toolCalls.length ? "tool_use" : "end", text, toolCalls,
        assistant: { role: "assistant", content: [...(text ? [{ type: "text" as const, text }] : []), ...toolCalls] },
        usage: { inputTokens: 100, outputTokens: 20 }, ...r,
      };
    },
  };
  return provider;
}
