import { isMasked, type Masked as MaskedValue } from "@amax/auth";
import { Masked } from "@amax/ui";
import type { ClaimView } from "../server/rows";

const TINTS = ["a1", "a2", "a3", "a4"];
export const tint = (id: string) => TINTS[[...id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length];
export const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const Text = ({ v }: { v: string | MaskedValue }) => (isMasked(v) ? <Masked masked /> : <>{v}</>);

function Who({ c }: { c: ClaimView }) {
  return <div className="who"><span className={`av sm ${tint(c.id)}`} aria-hidden="true">{initials(c.personName)}</span>{c.personName}</div>;
}

function What({ c }: { c: ClaimView }) {
  return (
    <div className="what">
      <span>{c.categoryName}: <Text v={c.merchant} /></span>
      <small><Text v={c.description} />{c.receipt ? ", receipt attached" : ", no receipt"}</small>
    </div>
  );
}

export function ClaimCells({ c }: { c: ClaimView }) {
  return (
    <>
      <td data-label="Person"><Who c={c} /></td>
      <td data-label="Expense"><What c={c} /></td>
      <td data-label="Spent">{c.spentText}</td>
      <td data-label="Amount" className="num">{c.amountText}{c.overLimit && <small className="over">Over the {c.limitText} limit</small>}</td>
    </>
  );
}
