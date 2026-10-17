import { z } from "zod";
import type { Registry, RegisteredTool } from "@amax/mcp";

const schemaOf = (t: RegisteredTool) => {
  try {
    return z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" });
  } catch {
    return { type: "object" };
  }
};

const ERRORS = {
  "400": { description: "Invalid input" },
  "401": { description: "Missing, invalid, revoked or expired token" },
  "403": { description: "Outside the caller's role, scopes or acts-for list" },
  "404": { description: "No such tool or record" },
  "429": { description: "Rate limited; see Retry-After", headers: { "Retry-After": { schema: { type: "integer" } } } },
};

function operation(t: RegisteredTool) {
  return {
    post: {
      operationId: t.name,
      summary: t.description,
      tags: [t.module],
      "x-amax-scope": `${t.module}:${t.scope}`,
      "x-amax-permission": t.permission || null,
      parameters: [{ name: "amax-act-for", in: "header", required: false, description: "Service credentials: the id of the person this call acts for", schema: { type: "string", format: "uuid" } }],
      requestBody: { required: true, content: { "application/json": { schema: schemaOf(t) } } },
      responses: { "200": { description: "The tool's result", content: { "application/json": { schema: { type: "object", properties: { result: {} } } } } }, ...ERRORS },
    },
  };
}

export function openApi(registry: Registry, base: string) {
  const tools = registry.all.filter((t) => !t.secretInput);
  return {
    openapi: "3.1.0",
    info: { title: "amax API", version: "1", description: "Every amax capability, generated from the same tools as MCP and chat, with the same permissions and audit." },
    servers: [{ url: `${base.replace(/\/$/, "")}/api/v1` }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" }, clientCredentials: { type: "oauth2", flows: { clientCredentials: { tokenUrl: `${base.replace(/\/$/, "")}/oauth/token`, scopes: {} } } } } },
    paths: Object.fromEntries(tools.map((t) => [`/tools/${t.name}`, operation(t)])),
  };
}
