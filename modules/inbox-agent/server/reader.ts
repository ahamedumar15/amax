import type { ServiceContext } from "@amax/core/server";
import { useSecret } from "@amax/core/secrets";
import type { SourceKind } from "../contracts";
import { graphReader, type GraphApp } from "./graph";
import { sandboxReader } from "./sandbox";

/** An allow-listed source and the moment from which it may be read. */
export type SourceToRead = { id: string; kind: SourceKind; address: string; label: string; since: string };
/** One message as read: untrusted HTML or text from outside, its time and a link to it. */
export type RawMessage = { sourceId: string; id: string; at: string; body: string; link: string | null };
export type InboxReader = (sources: SourceToRead[]) => Promise<RawMessage[]>;

let testReader: InboxReader | null = null;
/** Tests stand in for Graph here; a real mailbox is never reachable from a test. */
export const setTestReader = (r: InboxReader | null) => void (testReader = r);

// The Graph app credential is the 031 `msgraph-read` secret (JSON: tenant, clientId, clientSecret),
// opened only for the read; its value never leaves the callback and is never logged.
export function readerFor(ctx: ServiceContext, sandbox: boolean): InboxReader {
  if (testReader) return testReader;
  if (sandbox) return sandboxReader;
  return (sources) => useSecret(ctx, { connector: "msgraph-read", purpose: "read the inbox agent's allowed mailboxes and channels" },
    (s) => graphReader(JSON.parse(s.reveal()) as GraphApp)(sources));
}
