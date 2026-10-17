"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentViewer } from "@amax/auth";
import { ForbiddenError, ValidationError, type ServiceContext } from "@amax/core/server";
import { putSecret, revokeSecret, SecretsUnavailableError } from "@amax/core/secrets";
import { getDb } from "../../../../lib/server";
import { adminContext } from "./context";

const PAGE = "/settings/keys";

async function context(): Promise<ServiceContext> {
  getDb();
  return adminContext(await currentViewer());
}

function failure(e: unknown) {
  if (e instanceof ValidationError) return "invalid";
  if (e instanceof SecretsUnavailableError) return "nokms";
  if (e instanceof ForbiddenError) throw e;
  return "failed";
}

const expiry = (v: FormDataEntryValue | null) => (v ? `${String(v)}T00:00:00Z` : null);

async function attempt(back: string, fn: (ctx: ServiceContext) => Promise<unknown>) {
  let error: string | null = null;
  try {
    await fn(await context());
  } catch (e) {
    error = failure(e);
  }
  revalidatePath(PAGE);
  redirect(error ? `${PAGE}?${back}&error=${error}` : `${PAGE}?saved=1`);
}

export async function putSecretAction(data: FormData) {
  const connector = String(data.get("connector") ?? "");
  const mode = data.get("mode") === "rotate" ? `rotate=${encodeURIComponent(connector)}` : "add=1";
  await attempt(mode, (ctx) => putSecret(ctx, {
    connector,
    value: String(data.get("value") ?? ""),
    expiresAt: expiry(data.get("expiresAt")),
    graceHours: Number(data.get("graceHours") ?? 72),
  }));
}

export async function revokeSecretAction(data: FormData) {
  const connector = String(data.get("connector") ?? "");
  await attempt(`rotate=${encodeURIComponent(connector)}`, (ctx) => revokeSecret(ctx, { connector, reason: String(data.get("reason") ?? "") }));
}
