import { loadEnv } from "@amax/core/env";

export const siteUrl = () => (loadEnv().AMAX_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
