// A ustar archive: the export is one file a customer can open with any tar tool.
const BLOCK = 512;

function header(name: string, size: number, mtime: Date) {
  const h = Buffer.alloc(BLOCK);
  const cut = name.length > 100 ? name.lastIndexOf("/", 155) : -1;
  const [prefix, base] = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : ["", name];
  if (base.length > 100 || prefix.length > 155) throw new Error(`tar: ${name} is too long`);
  const put = (at: number, len: number, value: string) => h.write(value.slice(0, len), at, len, "utf8");
  const octal = (at: number, len: number, n: number) => put(at, len, `${n.toString(8).padStart(len - 1, "0")}\0`);
  put(0, 100, base);
  octal(100, 8, 0o644);
  octal(108, 8, 0);
  octal(116, 8, 0);
  octal(124, 12, size);
  octal(136, 12, Math.floor(mtime.getTime() / 1000));
  h.fill(" ", 148, 156);
  put(156, 1, "0");
  put(257, 6, "ustar\0");
  put(263, 2, "00");
  put(345, 155, prefix);
  let sum = 0;
  for (const b of h) sum += b;
  put(148, 8, `${sum.toString(8).padStart(6, "0")}\0 `);
  return h;
}

export function tar(entries: { name: string; body: Uint8Array }[], mtime = new Date()): Uint8Array {
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(header(e.name, e.body.length, mtime), Buffer.from(e.body), Buffer.alloc((BLOCK - (e.body.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return new Uint8Array(Buffer.concat(parts));
}

/** Reads the names and bodies back (tests and the drill's own check of an export). */
export function untar(data: Uint8Array): { name: string; body: Uint8Array }[] {
  const out: { name: string; body: Uint8Array }[] = [];
  const buf = Buffer.from(data);
  for (let at = 0; at + BLOCK <= buf.length; ) {
    const h = buf.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) break;
    const text = (from: number, len: number) => h.toString("utf8", from, from + len).replace(/\0.*$/s, "");
    const size = parseInt(text(124, 12), 8);
    const prefix = text(345, 155);
    out.push({ name: prefix ? `${prefix}/${text(0, 100)}` : text(0, 100), body: new Uint8Array(buf.subarray(at + BLOCK, at + BLOCK + size)) });
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}
