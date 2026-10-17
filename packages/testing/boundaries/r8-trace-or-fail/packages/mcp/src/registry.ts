import { traceStepOrFail } from "@amax/core/server";

export const step = () => traceStepOrFail({ kind: "tool_call" });
