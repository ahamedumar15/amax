const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Whole months from `from` to `to` (ISO days): the tree's y axis is linear in these. */
export const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/** "Jun 2021" for month `m` counted from `start`. */
export const monthLabel = (start: string, m: number) => {
  const n = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1 + m;
  return `${MON[n % 12]} ${Math.floor(n / 12)}`;
};

export const monthYear = (iso: string) => monthLabel(iso, 0);
