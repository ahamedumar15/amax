import type { Plan } from "../server/plan";
import { KeyflowError, type Batch, type ChangesReply, type KeyflowTransport } from "../server/transport";

/** A stand-in Keyflow for tests: records what it was sent and answers as told. */
export function fakeKeyflow(answer: { refuse?: (b: Batch) => { ref: string; reason: string }[]; changes?: Partial<ChangesReply>; fail?: string } = {}) {
  const pushed: Batch[] = [];
  const cursors: (string | null)[] = [];
  const transport = (_plan: Plan): KeyflowTransport => ({
    push: async (b) => {
      if (answer.fail) throw new KeyflowError(answer.fail);
      pushed.push(b);
      return { refused: answer.refuse?.(b) ?? [] };
    },
    changes: async (cursor) => (cursors.push(cursor), { goals: [], reviews: [], recognition: [], cursor: "c2", ...answer.changes }),
  });
  return { transport, pushed, cursors };
}
