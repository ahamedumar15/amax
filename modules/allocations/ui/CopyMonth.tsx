import { copyMonthAction } from "../actions";
import { monthLabel } from "../server/months";

// Copy to next month: pick the month to copy from; slots already planned in the next month stay as they are.
export function CopyMonth({ months, team }: { months: string[]; team: string }) {
  return (
    <form action={copyMonthAction} className="actions">
      <input type="hidden" name="team" value={team} />
      <select className="select" name="from" aria-label="Copy from month" defaultValue={months[0]}>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m, "long")}</option>)}
      </select>
      <button className="btn primary" type="submit">Copy to next month</button>
    </form>
  );
}
