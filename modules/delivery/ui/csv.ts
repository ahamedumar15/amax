// CSV export for spreadsheet apps. Titles, owners and project names arrive from chat, MCP and the
// specclaw sync, so a cell that opens with a formula trigger (= + - @, tab, CR) is prefixed with a
// quote: Excel and Sheets then show it as text instead of running it (review round 1).
const TRIGGER = /^[=+\-@\t\r]/;

export const csvCell = (value: string) => {
  const safe = TRIGGER.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const csvText = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export const csvHref = (rows: string[][]) => `data:text/csv;charset=utf-8,${encodeURIComponent(csvText(rows))}`;
