import { z } from "zod";
import { connectedClients, getMcpClient, revokeMcpClient, toolCatalogue } from "@amax/mcp/admin";
import { ctxFor, notFound, read, tool, write, type AdminDeps } from "./tool";

const READ = "mcp:client:read";
const client = { clientId: z.string().min(1), userId: z.string().min(1) };

export const mcpTools = (d: AdminDeps) => [
  tool({ ...read(READ), name: "list_mcp_clients", description: "MCP clients connected to amax: client, person, scopes and last sign-in.", input: z.object({}),
    run: (v) => connectedClients(d.db(), v.tenantId) }),
  tool({ ...read(READ), name: "get_mcp_client", description: "One person's grant to one MCP client: scopes and last sign-in.", input: z.object(client),
    run: async (v, a) => (await getMcpClient(d.db(), v.tenantId, a.clientId, a.userId)) ?? Promise.reject(notFound("client grant")) }),
  tool({ ...read(READ), name: "get_mcp_tool", description: "One amax MCP tool: its module, scope and which roles can use it.", input: z.object({ name: z.string().min(1) }),
    run: async (v, a) => toolCatalogue(d.tools(), v.tenantId).find((t) => t.name === a.name) ?? Promise.reject(notFound(`tool ${a.name}`)) }),
  tool({ ...write("mcp:client:revoke"), name: "revoke_mcp_client", description: "Revoke one person's grant to an MCP client; its tokens stop working at once.", destructive: true,
    input: z.object(client), run: (v, a, s) => revokeMcpClient(ctxFor(v, s), a) }),
];
