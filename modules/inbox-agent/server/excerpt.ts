// 025 AC-5: a message is kept only as a short plain-text excerpt and a link. Mail and Teams bodies are
// HTML from outside: tags are dropped here, never rendered, and the screen shows the excerpt as text.
export const EXCERPT_MAX = 280;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g;

export function plainText(html: string) {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(HIDDEN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first EXCERPT_MAX characters of the message as plain text, cut at a word. */
export function excerptOf(body: string) {
  const text = plainText(body);
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > EXCERPT_MAX / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

// Links come from Graph, which is outside data too: only https to Outlook or Teams (or a reserved
// .example host, for the fictional sandbox) is kept, so a javascript: or look-alike URL never reaches a page.
const HOSTS = new Set(["outlook.office.com", "outlook.office365.com", "outlook.live.com", "teams.microsoft.com", "teams.cloud.microsoft"]);

export function safeLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return HOSTS.has(u.hostname) || u.hostname.endsWith(".example") ? u.toString() : null;
  } catch {
    return null;
  }
}
