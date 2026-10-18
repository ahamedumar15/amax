export function DemoLink({ email, primary }: { email?: string; primary?: boolean }) {
  if (!email) return null;
  return <a className={primary ? "btn2 b-act" : "btn2 b-soft"} href={`mailto:${email}?subject=${encodeURIComponent("amax demo")}`}>Book a demo</a>;
}
