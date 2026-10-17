import { register } from "node:module";

// The Temporal worker loads module manifests, whose screens import CSS; on the server that's nothing.
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, next) {
  if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
  return next(url, context);
}`));
