"use client";

import { useRef, useState } from "react";

const SRC = "/marketing/amax-product";

export function ProductVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const play = () => {
    setStarted(true);
    video.current?.focus();
    void video.current?.play();
  };
  return (
    <section id="tour" className="film" aria-labelledby="tour-title">
      <div className="wrap">
        <h2 id="tour-title" className="sr">Product tour</h2>
        <div className="stage" data-ui>
          <video ref={video} tabIndex={0} controls={started} preload="none" playsInline poster={`${SRC}-poster.jpg`} aria-label="amax product tour, 35 seconds">
            <source src={`${SRC}.mp4`} type="video/mp4" />
            <source src={`${SRC}.webm`} type="video/webm" />
            <track kind="captions" srcLang="en" label="English" src={`${SRC}.en.vtt`} />
          </video>
          {!started && <button type="button" className="play" onClick={play}><span aria-hidden="true">▶</span> Play the 35-second product tour</button>}
        </div>
        <div className="cap"><span>A commit closes a task, amax drafts the hours, Liam accepts them, and the PM approves the submitted week in chat.</span><span>All data is fictional.</span></div>
      </div>
    </section>
  );
}
