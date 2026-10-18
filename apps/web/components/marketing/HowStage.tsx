"use client";

import { useEffect, useState } from "react";

const CARD = (
  <div className="qcard"><span className="ic v2" aria-hidden="true">h</span><div><div className="t">Add 2.5 h on Contoso Portal for Wed</div><div className="d">Drafted from commit 4f2c1e9</div><span className="who">Git ingestion, for Liam Walsh</span></div><span className="go">Accept</span></div>
);

export function HowStage() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = [...document.querySelectorAll<HTMLElement>(".how .step")];
    const io = new IntersectionObserver((seen) => seen.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.step))), { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((s) => io.observe(s));
    setStep(0);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".how .step").forEach((s) => s.classList.toggle("on", step === null || Number(s.dataset.step) === step));
  }, [step]);
  const show = (i: number) => step === null || step >= i;
  return (
    <div className="m2pin" data-ui aria-hidden={step !== null}>
      {show(0) && <div className="term"><span className="g">liam@lumen ~/contoso-portal $</span> git commit -m &quot;AMX-142 Export the invoice list to CSV&quot;<br /><span className="g">✓ amax:</span> AMX-142 closed · 2.5 h suggested to Liam Walsh</div>}
      {show(1) && CARD}
      {show(2) && <p className="audit">✓ Accepted by Liam Walsh · audit entry chained to the one before it</p>}
    </div>
  );
}
