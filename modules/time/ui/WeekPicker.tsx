"use client";

import { isoWeekOf, weekKey } from "../week";

/** 073 AC-21: beside the week arrows, a date jumps to the week that contains it. Navigation only. */
export function WeekPicker({ base }: { base: "" | "/my" }) {
  return <input className="btn sm" type="date" aria-label="Jump to the week of" style={{ width: 150 }}
    onChange={(e) => { if (e.target.value) window.location.assign(`/time${base}/${base ? "" : "w/"}${weekKey(isoWeekOf(new Date(`${e.target.value}T00:00:00Z`)))}`); }} />;
}
