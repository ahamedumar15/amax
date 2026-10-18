// AC-2: password, MFA and credential requests are never the agent's. They go to the IT queue for a
// person to verify the requester's identity first, and the agent proposes nothing for them.
const CREDENTIAL = /pass ?word|passcode|passphrase|\bmfa\b|\b2fa\b|multi-?factor|two-?factor|authenticator|\botp\b|one-?time code|credential|locked out|lock(ed)? my account|recovery code|security key|passkey|reset my (login|account|sign-?in)/i;

export const VERIFY_NOTE = "Needs identity verification";

export const isCredentialRequest = (...text: (string | null | undefined)[]) => CREDENTIAL.test(text.filter(Boolean).join("\n"));

// Text from Teams and email is outside data: tags are dropped and it is shown and stored as plain text.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g;
export const plainText = (s: string) => s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ").replace(HIDDEN, "").replace(/[ \t]+/g, " ").trim();

const LINK_HOSTS = new Set(["outlook.office.com", "outlook.office365.com", "outlook.live.com", "teams.microsoft.com", "teams.cloud.microsoft"]);

/** The link to the source message: https to Outlook or Teams (or a reserved .example host for the sandbox) only. */
export function safeLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return LINK_HOSTS.has(u.hostname) || u.hostname.endsWith(".example") ? u.toString() : null;
  } catch {
    return null;
  }
}
