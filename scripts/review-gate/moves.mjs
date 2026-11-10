const NUMBERED = /^(\d{3,})-(.+)$/;
const neutral = (text, names) => names.reduce((out, name) => out.split(name).join("\0change\0"), text);

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
