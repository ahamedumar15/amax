// 023 AC-2: the screening agent's read of a CV against the role's skills. Rule-based (no model call):
// each skill the CV names is a match, and the evidence is the CV section and sentence that named it.
// The score is a suggestion a person accepts; it never closes an application.
export type CvSection = { heading: string; text: string };
export type MatchEvidence = { skill: string; section: string; excerpt: string };
export type Match = { score: number; evidence: MatchEvidence[]; missing: string[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentenceWith = (text: string, at: number) => {
  const from = Math.max(text.lastIndexOf(". ", at) + 2, 0);
  const end = text.indexOf(". ", at);
  return text.slice(from === 1 ? 0 : from, end < 0 ? undefined : end + 1).trim().slice(0, 200);
};

export function scoreCv(skills: string[], cv: CvSection[]): Match {
  const evidence: MatchEvidence[] = [];
  const missing: string[] = [];
  for (const skill of skills) {
    const re = new RegExp(`(^|[^a-z0-9])${escape(skill.toLowerCase())}($|[^a-z0-9])`);
    const hit = cv.map((s) => ({ s, at: s.text.toLowerCase().search(re) })).find((x) => x.at >= 0);
    if (hit) evidence.push({ skill, section: hit.s.heading, excerpt: sentenceWith(hit.s.text, hit.at) });
    else missing.push(skill);
  }
  return { score: skills.length ? Math.round((100 * evidence.length) / skills.length) : 0, evidence, missing };
}
