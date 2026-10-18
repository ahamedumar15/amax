import { z } from "zod";
import { getJson, GraphError, postJson } from "./wire";

// AC-1: Intune Endpoint Analytics and the Defender risk Intune holds, read with 021's msgraph-read
// registration. Each answer is parsed to the fields below; anything else in it (device and user
// names included) is dropped before it reaches the database.
export type GraphApp = { tenant: string; clientId: string; clientSecret: string };
export type DeviceReading = { externalId: string; upn: string | null; model: string; startupScore: number; bootSeconds: number; appScore: number; crashes: number; hangs: number; batteryPct: number | null; risk: Risk };
export type AppReading = { externalId: string; app: string; version: string; crashes: number; hangs: number };
export type Snapshot = { devices: DeviceReading[]; apps: AppReading[] };
type Risk = "none" | "low" | "medium" | "high";

const BETA = "https://graph.microsoft.com/beta/deviceManagement";
const id = z.string().min(1).max(200);
const n = z.number().nullish().transform((v) => Math.max(0, Math.round(v ?? 0)));
const page = <T extends z.ZodType>(item: T) => z.object({ value: z.array(item).max(1000), "@odata.nextLink": z.string().optional() });
const Managed = z.object({ id, userPrincipalName: z.string().max(320).nullish(), model: z.string().max(120).nullish(), partnerReportedThreatState: z.string().max(40).nullish() });
const Startup = z.object({ id, startupPerformanceScore: n, coreBootTimeInMs: n });
const Health = z.object({ deviceId: id, deviceAppHealthScore: n, appCrashCount: n, appHangCount: n });
const ByVersion = z.object({ deviceId: id, appDisplayName: z.string().min(1).max(120), appVersion: z.string().min(1).max(40), appCrashCount: n });
const Battery = z.object({ deviceId: id, maxCapacityPercentage: n });
const RISK: Record<string, Risk> = { lowSeverity: "low", mediumSeverity: "medium", highSeverity: "high", compromised: "high" };

async function all<T extends z.ZodType>(url: string, item: T, token: string): Promise<z.infer<T>[]> {
  const out: z.infer<T>[] = [];
  let next: string | undefined = url;
  for (let i = 0; next && i < 20; i++) {
    const r = page(item).safeParse(await getJson(next, token));
    if (!r.success) throw new GraphError("Microsoft Graph's answer wasn't in the expected shape");
    out.push(...r.data.value);
    next = r.data["@odata.nextLink"];
  }
  return out;
}

async function token(app: GraphApp) {
  const body = new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString();
  const r = z.object({ access_token: z.string().min(1) }).safeParse(await postJson(`https://login.microsoftonline.com/${encodeURIComponent(app.tenant)}/oauth2/v2.0/token`, body, { "content-type": "application/x-www-form-urlencoded" }));
  if (!r.success) throw new GraphError("Microsoft sign-in's answer wasn't in the expected shape");
  return r.data.access_token;
}

export const graphToken = token;

export async function readGraph(app: GraphApp): Promise<Snapshot> {
  const t = await token(app);
  const [managed, startup, health, versions, battery] = [
    await all(`${BETA}/managedDevices?$select=id,userPrincipalName,model,partnerReportedThreatState`, Managed, t),
    await all(`${BETA}/userExperienceAnalyticsDevicePerformance?$select=id,startupPerformanceScore,coreBootTimeInMs`, Startup, t),
    await all(`${BETA}/userExperienceAnalyticsAppHealthDevicePerformance?$select=deviceId,deviceAppHealthScore,appCrashCount,appHangCount`, Health, t),
    await all(`${BETA}/userExperienceAnalyticsAppHealthAppPerformanceByAppVersionDeviceId?$select=deviceId,appDisplayName,appVersion,appCrashCount`, ByVersion, t),
    await all(`${BETA}/userExperienceAnalyticsBatteryHealthDevicePerformance?$select=deviceId,maxCapacityPercentage`, Battery, t),
  ];
  const devices = managed.flatMap((m): DeviceReading[] => {
    const s = startup.find((x) => x.id === m.id), h = health.find((x) => x.deviceId === m.id), b = battery.find((x) => x.deviceId === m.id);
    if (!s || !h) return [];
    return [{ externalId: m.id, upn: m.userPrincipalName ?? null, model: m.model || "Unknown model", startupScore: Math.min(100, s.startupPerformanceScore), bootSeconds: Math.round(s.coreBootTimeInMs / 1000),
      appScore: Math.min(100, h.deviceAppHealthScore), crashes: h.appCrashCount, hangs: h.appHangCount, batteryPct: b ? Math.min(100, b.maxCapacityPercentage) : null, risk: RISK[m.partnerReportedThreatState ?? ""] ?? "none" }];
  });
  return { devices, apps: versions.map((v) => ({ externalId: v.deviceId, app: v.appDisplayName, version: v.appVersion, crashes: v.appCrashCount, hangs: 0 })) };
}
