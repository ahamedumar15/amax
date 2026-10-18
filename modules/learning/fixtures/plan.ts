import { MONTHLY, OPTIONAL_PEOPLE, PROGRAMMES, type Programme } from "./data";

// Turns data.ts into rows: who is in which optional programme, how far each got, and the hours
// each person logged per month, so the screen's totals come out exactly as fixtures.md says.
export const LAST_DAY = "2026-10-14";
export type Enrolment = { programme: Programme; person: string; progress: number; completed: string | null; rows: { on: string; hours: number }[] };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthOf = (m: number) => ({ from: `2026-${String(m).padStart(2, "0")}-01`, to: new Date(Date.UTC(2026, m, 0)).toISOString().slice(0, 10) });
const min = (...d: string[]) => d.sort()[0];
const max = (...d: string[]) => d.sort().at(-1)!;

/** Progress values averaging `completion` over `n` people: whole completions first, the rest shared out. */
export function progressOf(n: number, completion: number) {
  const total = Math.round(n * completion), done = Math.floor(total / 100), rest = total - done * 100, open = n - done;
  return Array.from({ length: n }, (_, i) => (i < done ? 100 : Math.floor(rest / open) + (i - done < rest % open ? 1 : 0)));
}

function enrol(people: string[]) {
  let at = 0;
  return PROGRAMMES.filter((p) => !p.mandatory).flatMap((p) => progressOf(p.people, p.completion).map((progress): Enrolment => {
    const person = people[at++ % OPTIONAL_PEOPLE];
    return { programme: p, person, progress, completed: progress === 100 ? min(p.ends, LAST_DAY) : null, rows: [] };
  }));
}

function attend(all: Enrolment[]) {
  const perProgramme = new Map<string, number>(), perPerson = new Map<string, number>();
  const load = (e: Enrolment) => (perProgramme.get(e.programme.title) ?? 0) / e.programme.hours;
  MONTHLY.forEach((target, i) => {
    const { from, to } = monthOf(i + 1);
    const open = all.filter((e) => e.programme.starts <= to && e.programme.ends >= from);
    const picked = new Set<string>();
    while (picked.size < target) {
      const next = open.filter((e) => !picked.has(e.person))
        .sort((a, b) => load(a) - load(b) || (perPerson.get(a.person) ?? 0) - (perPerson.get(b.person) ?? 0))[0];
      if (!next) throw new Error(`learning fixtures: too few people in programmes in ${from.slice(0, 7)} for ${target}`);
      const start = max(next.programme.starts, from), end = min(next.programme.ends, to, LAST_DAY);
      next.rows.push({ on: min(addDays(start, picked.size % 9), end), hours: 0 });
      picked.add(next.person);
      perProgramme.set(next.programme.title, (perProgramme.get(next.programme.title) ?? 0) + 1);
      perPerson.set(next.person, (perPerson.get(next.person) ?? 0) + 1);
    }
  });
}

/** Shares each programme's hours over its attendance rows in hundredths, so they sum exactly. */
function share(all: Enrolment[]) {
  for (const p of PROGRAMMES.filter((x) => !x.mandatory)) {
    const rows = all.filter((e) => e.programme === p).flatMap((e) => e.rows);
    if (!rows.length || p.hours / rows.length > 24) throw new Error(`learning fixtures: ${p.title} can't hold ${p.hours} hours in ${rows.length} days`);
    const cents = p.hours * 100, each = Math.floor(cents / rows.length);
    rows.forEach((r, i) => { r.hours = (each + (i < cents - each * rows.length ? 1 : 0)) / 100; });
  }
}

/** The optional-programme plan for these people (hr.person ids, in a stable order). */
export function plan(people: string[]): Enrolment[] {
  if (people.length < OPTIONAL_PEOPLE) throw new Error(`learning fixtures need ${OPTIONAL_PEOPLE} people, hr has ${people.length}`);
  const all = enrol(people);
  attend(all);
  share(all);
  return all;
}
