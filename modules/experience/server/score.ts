import { CHOICE_VALUE, MIN_GROUP, SHOWN_GROUPS, type Choice } from "../contracts";

// AC-3: score = 40% device health + 40% app reliability + 20% pulse, each out of 10. Without 5
// answers there is no pulse part, and the two device parts count half each.
export type Reading = { key: string; person: string; startup: number; app: number; device?: string };
export type Answer = { key: string | null; choice: Choice };
export type Parts = { people: number; devices: number; answers: number; device: number; app: number; pulse: number | null; score: number };

const mean = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function partsOf(readings: Reading[], answers: Answer[]): Parts {
  const device = mean(readings.map((r) => r.startup)) / 10, app = mean(readings.map((r) => r.app)) / 10;
  const pulse = answers.length >= MIN_GROUP ? mean(answers.map((a) => CHOICE_VALUE[a.choice])) : null;
  const score = pulse === null ? 0.5 * device + 0.5 * app : 0.4 * device + 0.4 * app + 0.2 * pulse;
  return { people: new Set(readings.map((r) => r.person)).size, devices: readings.length, answers: answers.length, device: round1(device), app: round1(app), pulse: pulse === null ? null : round1(pulse), score: round1(score) };
}

export type Group = Parts & { key: string; label: string; members: string[] };

/** The five largest groups of 5 or more people, then "Other" for the rest, shown only when it has 5 too. */
export function groupsOf(readings: Reading[], answers: Answer[], label: (key: string) => string = (k) => k) {
  const keys = [...new Set(readings.map((r) => r.key))];
  const sized = keys.map((key) => ({ key, people: new Set(readings.filter((r) => r.key === key).map((r) => r.person)).size }))
    .sort((a, b) => b.people - a.people || a.key.localeCompare(b.key));
  const shown = sized.filter((g) => g.people >= MIN_GROUP).slice(0, SHOWN_GROUPS).map((g) => g.key);
  const rest = sized.filter((g) => !shown.includes(g.key)).map((g) => g.key);
  const of = (ks: string[]) => partsOf(readings.filter((r) => ks.includes(r.key)), answers.filter((a) => a.key !== null && ks.includes(a.key)));
  const groups: Group[] = shown.map((key) => ({ key, label: label(key), members: [key], ...of([key]) }));
  const other = { key: "other", label: "Other", members: rest.map(label), ...of(rest) };
  return { groups: other.people >= MIN_GROUP ? [...groups, other] : groups, hidden: other.people >= MIN_GROUP ? 0 : other.people, all: partsOf(readings, answers) };
}

/** The 4-week trend in tenths: Steady within 0.2, else up or down. */
export function trendOf(now: number, then: number | null) {
  if (then === null) return { kind: "new" as const, delta: null };
  const delta = Math.round(now * 10) - Math.round(then * 10);
  return { kind: Math.abs(delta) < 3 ? ("steady" as const) : delta > 0 ? ("up" as const) : ("down" as const), delta: delta / 10 };
}
