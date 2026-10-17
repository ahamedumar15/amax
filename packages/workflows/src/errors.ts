/** Thrown from a step to fail it without retrying (bad input, a refusal, a permanent 4xx). */
export class NonRetryableError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/** What the workflow body sees when a step has used up its retries; catch it to compensate. */
export class StepFailedError extends Error {
  constructor(public step: string, public reason: string) {
    super(`step "${step}" failed: ${reason}`);
    this.name = "StepFailedError";
  }
}

export class NondeterminismError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NondeterminismError";
  }
}

// Drizzle wraps database errors as "Failed query: <sql>"; the cause says what actually went wrong.
const messageOf = (e: unknown) => (e instanceof Error ? (e.message.startsWith("Failed query") && e.cause instanceof Error ? e.cause.message : e.message) : String(e));
export const errorText = (e: unknown) => messageOf(e).slice(0, 2000);
export const isRetryable = (e: unknown) => !(typeof e === "object" && e !== null && (e as { retryable?: unknown }).retryable === false);
