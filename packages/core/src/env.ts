import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AMAX_BASE_URL: z.url().optional(),
  AMAX_MODULES_DISABLED: z.string().regex(/^[a-z0-9,-]*$/, "comma-separated module ids").optional(),
  PORT: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`amax: invalid environment configuration\n${lines.join("\n")}\nFix these variables and restart.`);
}
