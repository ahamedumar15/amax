import type { z } from "zod";

// Provider-neutral conversation shapes. Assistant turns keep the provider's own content (`raw`) so
// thinking blocks go back unchanged on the next request, as the provider requires.
export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };
export type Message =
  | { role: "user"; content: (TextBlock | ToolResultBlock)[] }
  | { role: "assistant"; content: (TextBlock | ToolUseBlock)[]; raw?: unknown };

export type ToolSpec = { name: string; description: string; input: z.ZodType };

export type ProviderCall = {
  model: string;
  system: string;
  messages: Message[];
  schema?: z.ZodType;
  tools?: ToolSpec[];
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

export type Usage = { inputTokens: number; outputTokens: number };

export type ProviderResult = {
  model: string;
  stop: "end" | "tool_use" | "refusal" | "max_tokens";
  text: string;
  /** Present when `schema` was given and the provider returned schema-valid output. */
  parsed?: unknown;
  toolCalls: ToolUseBlock[];
  assistant: Extract<Message, { role: "assistant" }>;
  usage: Usage;
};

export interface Provider {
  name: string;
  call(req: ProviderCall): Promise<ProviderResult>;
}

/** USD per million tokens, input / output (Claude API list prices). */
export const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
export const costOf = (model: string, u: Usage) => {
  const [i, o] = PRICES[model] ?? [0, 0];
  return (u.inputTokens * i + u.outputTokens * o) / 1_000_000;
};
