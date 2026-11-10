const NUMBERED = /^(\d{3,})-(.+)$/;
const neutral = (text, names) => names.reduce((out, name) => out.split(name).join("\0change\0"), text);

// 098 AC-7: a folder this PR only moved to a new number (same slug, old one gone, every file the same apart from the
// change's own name) carries no new work, so the gate has nothing to judge in it.
export function movedFrom(name, { baseDirs, headDirs, filesAt }) {
  const slug = NUMBERED.exec(name)?.[2];
  if (!slug || baseDirs.includes(name)) return null;
  const old = baseDirs.find((d) => NUMBERED.exec(d)?.[2] === slug && !headDirs.includes(d));
  if (!old) return null;
  const before = filesAt("base", old), after = filesAt("head", name);
  const same = before.size > 0 && before.size === after.size
    && [...before].every(([path, body]) => after.has(path) && neutral(after.get(path), [name, old]) === neutral(body, [name, old]));
  return same ? old : null;
}
