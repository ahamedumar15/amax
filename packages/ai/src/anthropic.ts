import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { toolInputSchema } from "./tool-schema";
import type { Message, Provider, ProviderCall, ProviderResult, ToolUseBlock } from "./types";

// The only place in the repo that talks to a model provider SDK (check-graph R7).
// `baseURL`: the configured endpoint (044), the same one the region gate checks.
export function anthropicProvider(opts: { apiKey?: string; baseURL?: string } = {}): Provider {
  const client = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) });

  const toParams = (messages: Message[]): Anthropic.MessageParam[] =>
    messages.map((m) => {
      if (m.role === "assistant") {
        if (m.raw) return { role: "assistant", content: m.raw as Anthropic.ContentBlockParam[] };
        return { role: "assistant", content: m.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: "tool_use", id: b.id, name: b.name, input: b.input })) };
      }
      return { role: "user", content: m.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError })) };
    });

  return {
    name: "anthropic",
    async call(req: ProviderCall): Promise<ProviderResult> {
      const base = {
        model: req.model,
        max_tokens: req.maxTokens,
        system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
        messages: toParams(req.messages),
      };
      const tools = req.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: toolInputSchema(t.input) as Anthropic.Tool.InputSchema }));
      const response = req.schema
        ? await client.messages.parse({ ...base, output_config: { effort: req.effort, format: zodOutputFormat(req.schema) } })
        : await client.messages.create({ ...base, output_config: { effort: req.effort }, ...(tools?.length ? { tools } : {}) });
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const toolCalls: ToolUseBlock[] = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ type: "tool_use", id: b.id, name: b.name, input: b.input }));
      const stop = response.stop_reason === "tool_use" ? "tool_use" : response.stop_reason === "refusal" ? "refusal" : response.stop_reason === "max_tokens" ? "max_tokens" : "end";
      return {
        model: response.model,
        stop,
        text,
        parsed: "parsed_output" in response ? (response.parsed_output ?? undefined) : undefined,
        toolCalls,
        assistant: { role: "assistant", content: [...(text ? [{ type: "text" as const, text }] : []), ...toolCalls], raw: response.content },
        usage: { inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0), outputTokens: response.usage.output_tokens },
      };
    },
  };
}
