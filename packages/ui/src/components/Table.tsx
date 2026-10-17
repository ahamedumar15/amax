import type { ReactNode } from "react";

export type Column = { key: string; label: string; numeric?: boolean };
type TableProps = { caption: string; columns: Column[]; rows: Record<string, ReactNode>[] };

export function Table({ caption, columns, rows }: TableProps) {
  return (
    <table className="tbl">
      <caption className="sr">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className={c.numeric ? "num" : undefined}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key} data-label={c.label} className={c.numeric ? "num" : undefined}>{row[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
