import { z } from "zod";
import { approveExport, BACKUP_MANAGE, BACKUP_READ, backupOverview, cancelExport, cancelOffboarding, exportLink, getDrill, getExport, listDrills, listExports, readBackups, requestDrill, requestExport, startOffboarding } from "@amax/core/backup";
import type { Viewer } from "@amax/auth";
import { chatOnly, ctxFor, notFound, read, tool, write } from "./tool";

const ctx = (v: Viewer) => ctxFor(v, "chat");
const reason = z.string().min(3).max(500);
// Whole-tenant exports and offboarding happen only on chat's confirm card, never over MCP or the API.
const CONFIRM_CARD = "tenant exports and offboarding are asked for and approved only on amax chat's confirm card";
const look = <T>(v: Viewer, fn: Parameters<typeof readBackups<T>>[1]) => readBackups(ctx(v), fn);

// The same labels the screen pins with ("Tenant export Oct 17"), so a pin keeps its name in chat.
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const drillLabel = (d: { id: string; startedAt: string | null; requestedAt: string }) => `Restore drill ${day.format(new Date(d.startedAt ?? d.requestedAt))}`;
const exportLabel = (e: { id: string; requestedAt: string }) => `Tenant export ${day.format(new Date(e.requestedAt))}`;

/** 034: the Backups and export screen's tools. Admin only: the export holds pay and money (055). */
export const backupTools = [
  tool({ ...read(BACKUP_READ), pin: "view", name: "backups_overview", description: "The Backups and export screen: point-in-time recovery, the last snapshot, restore drills, tenant exports and any offboarding, attention first.",
    input: z.object({}), run: (v) => backupOverview(ctx(v)) }),
  tool({ ...read(BACKUP_READ), pin: "view", name: "list_restore_drills", description: "Weekly restore drills, newest first: the backup restored, how long it took, rows checked and whether the audit chain verified.",
    input: z.object({ status: z.enum(["requested", "passed", "slow", "failed"]).optional() }), run: async (v, a) => (await look(v, (tx) => listDrills(tx, 50))).filter((d) => !a.status || d.status === a.status) }),
  tool({ ...read(BACKUP_READ), pin: { id: "drillId", of: (d: { id: string; startedAt: string | null; requestedAt: string } | null) => (d ? { id: d.id, label: drillLabel(d) } : null) }, name: "get_restore_drill",
    description: "One restore drill with every table whose row count differed.", input: z.object({ drillId: z.uuid() }),
    run: async (v, a) => (await look(v, (tx) => getDrill(tx, a.drillId))) ?? Promise.reject(notFound(`restore drill ${a.drillId}`)) }),
  tool({ ...read(BACKUP_READ), pin: "view", name: "list_tenant_exports", description: "Whole-tenant exports, waiting ones first: who asked, who approved, and when the link expires.",
    input: z.object({}), run: (v) => look(v, (tx) => listExports(tx, 50)) }),
  tool({ ...read(BACKUP_READ), pin: { id: "exportId", of: (e: { id: string; requestedAt: string } | null) => (e ? { id: e.id, label: exportLabel(e) } : null) }, name: "get_tenant_export",
    description: "One tenant export: its approval, what it holds and its link's expiry.", input: z.object({ exportId: z.uuid() }),
    run: async (v, a) => (await look(v, (tx) => getExport(tx, a.exportId))) ?? Promise.reject(notFound(`tenant export ${a.exportId}`)) }),
  tool({ scope: "sensitive", permission: BACKUP_MANAGE, readOnly: true, name: "get_tenant_export_link", description: "The signed download link of a ready export; it stops working 24 hours after the export was built.",
    input: z.object({ exportId: z.uuid() }), run: async (v, a) => {
      const e = await look(v, (tx) => getExport(tx, a.exportId));
      if (!e || e.status !== "ready" || e.expired || !e.expiresAt) throw notFound(`a ready, unexpired export ${a.exportId}`);
      return { url: exportLink(v.tenantId, e.id, new Date(e.expiresAt)), expiresAt: e.expiresAt };
    } }),
  tool({ ...write(BACKUP_MANAGE), name: "request_restore_drill", description: "Run a restore drill now: the latest backup is restored into a scratch database and checked.", input: z.object({}), service: requestDrill, run: (v, _a, s) => requestDrill(ctxFor(v, s), {}) }),
  tool({ ...write(BACKUP_MANAGE), name: "request_tenant_export", description: "Ask for an export of all this organisation's data (JSON per module plus files). A second Admin approves it before it is built.",
    input: z.object({ reason }), service: requestExport, run: (v, a, s) => (chatOnly(s, CONFIRM_CARD), requestExport(ctxFor(v, s), a)) }),
  tool({ ...write(BACKUP_MANAGE), name: "approve_tenant_export", description: "Approve a tenant export someone else asked for; amax builds it and gives a link that works for 24 hours.",
    input: z.object({ exportId: z.uuid() }), service: approveExport, run: (v, a, s) => (chatOnly(s, CONFIRM_CARD), approveExport(ctxFor(v, s), { id: a.exportId })) }),
  tool({ ...write(BACKUP_MANAGE), name: "cancel_tenant_export", description: "Cancel a tenant export that is still waiting for approval.", input: z.object({ exportId: z.uuid() }), service: cancelExport, run: (v, a, s) => cancelExport(ctxFor(v, s), { id: a.exportId }) }),
  tool({ ...write(BACKUP_MANAGE), name: "start_tenant_offboarding", destructive: true, description: "This organisation is leaving amax: offer an export, wait 30 days, then destroy its data key so its backups can never be read.",
    input: z.object({ reason }), service: startOffboarding, run: (v, a, s) => (chatOnly(s, CONFIRM_CARD), startOffboarding(ctxFor(v, s), a)) }),
  tool({ ...write(BACKUP_MANAGE), name: "cancel_tenant_offboarding", description: "Stop a waiting offboarding before its data key is destroyed.", input: z.object({ id: z.uuid() }), service: cancelOffboarding, run: (v, a, s) => cancelOffboarding(ctxFor(v, s), a) }),
];
