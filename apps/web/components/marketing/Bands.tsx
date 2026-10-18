"use client";

import { useState } from "react";
import { AREAS } from "./areas";

export function Bands() {
  const [on, setOn] = useState<Record<string, boolean>>({ Delivery: true, "People and payroll": true });
  return (
    <section id="product" className="bands" aria-label="What amax covers" data-ui>
      {AREAS.map((a) => (
        <div key={a.title} className={on[a.title] ? `band ${a.tone}` : "band off"}>
          <h3>{a.pitch}</h3>
          <button type="button" className="sw" role="switch" aria-checked={Boolean(on[a.title])} aria-label={`Show ${a.title}`} onClick={() => setOn({ ...on, [a.title]: !on[a.title] })} />
          <div className="more" hidden={!on[a.title]}>
            <p>{a.live.map((c) => c.text).join(". ")}.</p>
            {a.coming.length > 0 && <p className="mk-coming"><span className="soon">Coming</span> {a.coming.map((c) => c.text).join(", ")}</p>}
          </div>
        </div>
      ))}
    </section>
  );
}
