export function DemoLink({ email, primary }: { email?: string; primary?: boolean }) {
  if (!email) return null;
  return <a className={primary ? "btn primary" : "btn"} href={`mailto:${email}?subject=${encodeURIComponent("amax demo")}`}>Book a demo</a>;
}
