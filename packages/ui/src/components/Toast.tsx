"use client";

type ToastProps = { message: string; actionLabel?: string; onAction?: () => void };

export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {actionLabel && onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
