import type { Harness } from "./harness";

export const temporalEnabled = process.env.AMAX_TEMPORAL_TESTS === "1" || Boolean(process.env.TEMPORAL_ADDRESS);
export async function temporalHarness(): Promise<Harness> {
  throw new Error("not built yet");
}
