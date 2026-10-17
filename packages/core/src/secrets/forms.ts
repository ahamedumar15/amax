const HIDDEN = "[secret]";
const ENCODED_RUN = /(?:[A-Za-z0-9+/_-]|%(?!3[Dd])[0-9A-Fa-f]{2}){12,}(?:=|%3[Dd]){0,2}/g;

const escaped = (s: string) => JSON.stringify(s).slice(1, -1);

export function formsOf(value: string): string[] {
  const bytes = Buffer.from(value);
  return [...new Set([
    value,
    bytes.toString("base64"),
    bytes.toString("base64url"),
    bytes.toString("hex"),
    encodeURIComponent(value),
    new URLSearchParams({ v: value }).toString().slice(2),
    escaped(value),
    escaped(escaped(value)),
  ])].filter((f) => f.length > 0);
}

const unpercent = (run: string) => run.replace(/%([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));

const decodings = (encoded: string, run = unpercent(encoded)) =>
  [0, 1, 2, 3].flatMap((offset) => [Buffer.from(run.slice(offset), "base64"), Buffer.from(run.slice(offset), "base64url")].map((b) => b.toString("latin1")));

const replaceForms = (text: string, forms: string[]) => forms.reduce((t, f) => t.split(f).join(HIDDEN), text);

function codesHold(codes: number[], values: string[]) {
  if (codes.length < 4) return false;
  const bytes = Buffer.from(codes.map((n) => n & 0xff));
  const decoded = [bytes.toString("utf8"), bytes.toString("utf16le"), bytes.subarray(1).toString("utf16le"), String.fromCharCode(...codes.map((n) => n & 0xffff))];
  return values.some((v) => decoded.some((d) => d.includes(v)));
}

function numbersHold(text: string, values: string[]) {
  const all = (text.match(/\d+/g) ?? []).map(Number);
  return [all, all.filter((_n, i) => i % 2 === 0), all.filter((_n, i) => i % 2 === 1)].some((codes) => codesHold(codes, values));
}

export const reveals = (text: string, values: string[]) => hide(text, values) !== text || numbersHold(text, values);

export function redact(text: string, values: string[]) {
  const hidden = hide(text, values);
  return numbersHold(hidden, values) ? HIDDEN : hidden;
}

export function hide(text: string, values: string[]): string {
  const forms = values.flatMap(formsOf).sort((a, b) => b.length - a.length);
  return replaceForms(text, forms).replace(ENCODED_RUN, (run) => (decodings(run).some((d) => forms.some((f) => d.includes(f))) ? HIDDEN : run));
}
