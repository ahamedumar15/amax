import type { ReactNode } from "react";

export type TicketTone = "info" | "good" | "attention" | "problem";
type Progress = { percent: number; label: string };
type TicketProps = { tone: TicketTone; label: string; value: string; note?: string; progress?: Progress; art?: ReactNode };

export function Ticket({ tone, label, value, note, progress, art }: TicketProps) {
  return (
    <div className={`ticket ${tone}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {art}
      <div className="p">
        {progress ? progress.label : note}
        {progress && (
          <div className="bar" role="img" aria-label={progress.label}>
            <i style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
