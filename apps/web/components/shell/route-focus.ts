// A navigation the chat panel starts for the person (following a re-tagged record, 057) must not
// pull focus out of the chat they are typing in. Chat names the path it is about to open; the route
// focus hook announces that screen but leaves focus where it is, once, for that path only.
let kept: string | null = null;

/** Called by chat just before it navigates to `path` on the person's behalf. */
export function keepFocusFor(path: string) {
  kept = path;
}

/** True, once, when `pathname` is the path chat asked to keep focus for. Any other path clears it. */
export function takeKeptFocus(pathname: string) {
  const norm = (p: string) => { try { return decodeURIComponent(p); } catch { return p; } };
  const keep = kept !== null && norm(kept) === norm(pathname);
  kept = null;
  return keep;
}
