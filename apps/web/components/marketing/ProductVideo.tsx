import { Mascot } from "@amax/ui";

const SRC = "/marketing/amax-product";

export function ProductVideo() {
  return (
    <figure className="mk-video">
      <span className="mk-face"><Mascot /></span>
      <video controls preload="none" playsInline poster={`${SRC}-poster.jpg`} aria-label="amax product video, 40 seconds">
        <source src={`${SRC}.webm`} type="video/webm" />
        <source src={`${SRC}.mp4`} type="video/mp4" />
        <track kind="captions" srcLang="en" label="English" src={`${SRC}.en.vtt`} default />
      </video>
      <figcaption>A commit closes a task, amax logs the time for the person it acted for, and the PM approves the week in chat. All data is fictional.</figcaption>
    </figure>
  );
}
