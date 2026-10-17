const HIDDEN = "[secret]";
const ENCODED_RUN = /[A-Za-z0-9+/_-]{12,}={0,2}/g;

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

const decodedHolds = (run: string, values: string[]) =>
  [Buffer.from(run, "base64").toString("latin1"), Buffer.from(run, "base64url").toString("latin1")].some((d) => values.some((v) => d.includes(v)));

export function hide(text: string, values: string[]): string {
  const forms = values.flatMap(formsOf).sort((a, b) => b.length - a.length);
  const direct = forms.reduce((t, f) => t.split(f).join(HIDDEN), text);
  return direct.replace(ENCODED_RUN, (run) => (decodedHolds(run, values) ? HIDDEN : run));
}
