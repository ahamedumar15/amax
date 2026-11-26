"use client";

export function When({ at }: { at: string }) {
  return <time dateTime={at} suppressHydrationWarning>{new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>;
}
