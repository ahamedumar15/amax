import { z } from "zod";
import { CREDENTIAL_MANAGE, REVOKE_REASONS, revokePrincipal } from "@amax/auth/credentials";
import { defineSuggestionKind } from "../kinds";

const Revoke = z.object({ credentialId: z.uuid(), reason: z.enum(REVOKE_REASONS) });

// 006: revoking a service credential cuts off whatever uses it, outside amax, and can't be taken back,
// so it is sensitive (not the person the agent acted for) and irreversible (two different approvers).
export const revokeCredentialKind = defineSuggestionKind<z.infer<typeof Revoke>, { revoked: boolean }>({
  kind: "auth.credential-revoke",
  title: "Revoke an API credential",
  permission: CREDENTIAL_MANAGE,
  proposed: Revoke,
  sensitive: true,
  irreversible: true,
  async apply(tx, _ctx, p) {
    const out = await revokePrincipal(tx, { id: p.credentialId, reason: p.reason });
    return { applied: { revoked: true }, action: "auth.principal.revoke", resource: "auth.service_principal", resourceId: out.resourceId, after: out.after, events: out.events };
  },
});

export const platformKinds = [revokeCredentialKind];
