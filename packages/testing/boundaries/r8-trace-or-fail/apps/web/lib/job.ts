export const step = async () => (await import("@amax/core/server")).traceStepOrFail({ kind: "job_run" });
