const TURNS: [boolean, string][] = [
  [true, "Who is over-allocated next month?"],
  [false, "Two people are over 100% in November: Nimali Perera (120%, Contoso Portal and Fleet Tracker) and Kasun Dias (110%). Should I move 20% of Nimali to December?"],
  [true, "Yes, move it."],
  [false, "Confirm: move 20% of Nimali Perera from Fleet Tracker to December."],
];

export function ChatPreview() {
  return (
    <section className="card" aria-labelledby="mk-chat">
      <div className="card-head"><h2 id="mk-chat">Ask amax</h2><span className="chip">Preview, fictional data</span></div>
      <ul className="mk-chat">{TURNS.map(([me, text]) => <li key={text} className={me ? "me" : undefined}>{text}</li>)}</ul>
    </section>
  );
}
