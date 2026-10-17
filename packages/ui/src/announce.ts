export const ANNOUNCE_EVENT = "amax:announce";

export function announce(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: message }));
}
