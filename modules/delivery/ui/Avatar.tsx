// The mock's illustrated people (no photos yet): the same face for the same initials, initials otherwise.
type Folk = [skin: string, style: "long" | "short" | "curly" | "bun" | "side" | "bald", hair: string, shirt: string, extra: { glasses?: 1; beard?: 1 }];
const FOLK: Record<string, Folk> = {
  MF: ["#D9A37E", "long", "#1E140E", "#7B61FF", { glasses: 1 }], DW: ["#BC8462", "short", "#140E0A", "#5CC8F0", {}], NS: ["#C68A62", "short", "#1C1410", "#2FCB8C", { beard: 1 }],
  AR: ["#D9A37E", "long", "#3A2418", "#F48B9B", {}], KD: ["#B97A56", "curly", "#15100C", "#5CC8F0", {}], TW: ["#E2B08C", "bun", "#2A1A12", "#F2A93B", {}],
  LM: ["#F4D2BC", "short", "#B5651D", "#5B44D6", {}], RF: ["#A86E4C", "short", "#0F0B08", "#9A97AE", { beard: 1 }], SK: ["#C99272", "side", "#1A120D", "#F2A93B", { glasses: 1 }],
  MR: ["#B07650", "short", "#120D0A", "#2FB5A0", { beard: 1 }], VC: ["#E0B394", "bald", "#6B4A35", "#5D5A73", { beard: 1 }], DF: ["#D49A72", "long", "#20150F", "#B9A9FF", {}],
  AM: ["#BF845E", "short", "#16100B", "#F26B5B", { glasses: 1 }], SP: ["#DDA985", "bun", "#24170F", "#7FD8F5", {}], RJ: ["#B57B55", "side", "#110C08", "#7B61FF", {}], HG: ["#E6B796", "long", "#3B2416", "#2FCB8C", {}],
};
const BGS = ["#ECE8FF", "#DDF7EC", "#FFF1D6", "#FDE7E4", "#DFF3FB"];
const TOP = "M12.4 16.5C12.4 10.6 15.7 8 20 8s7.6 2.6 7.6 8.5c-1.6-3-4.2-4.4-7.6-4.4s-6 1.4-7.6 4.4z";

function Face({ k, f }: { k: string; f: Folk }) {
  const [sk, st, hc, sh, o] = f;
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" fill={BGS[(k.charCodeAt(0) + k.charCodeAt(1)) % BGS.length]} />
      {st === "long" && <path d="M10.5 19c0-7.5 4-11.5 9.5-11.5S29.5 11.5 29.5 19v13h-19z" fill={hc} />}
      <path d="M6 40c0-8.5 6.2-12.5 14-12.5S34 31.5 34 40z" fill={sh} /><path d="M16.5 27.5 20 31l3.5-3.5" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.2" />
      <rect x="17" y="23" width="6" height="6" rx="2.5" fill={sk} style={{ filter: "brightness(.9)" }} />
      <ellipse cx="12.6" cy="18.6" rx="1.5" ry="2" fill={sk} /><ellipse cx="27.4" cy="18.6" rx="1.5" ry="2" fill={sk} />
      <ellipse cx="20" cy="18" rx="7.4" ry="8.6" fill={sk} />
      {o.beard && <path d="M12.8 19c.3 6 3.5 8.6 7.2 8.6s6.9-2.6 7.2-8.6c-1.4 2.6-3.8 3.6-7.2 3.6s-5.8-1-7.2-3.6z" fill={hc} opacity=".92" />}
      {(st === "short" || st === "long" || st === "bun") && <path d={TOP} fill={hc} />}
      {st === "bun" && <circle cx="20" cy="7.2" r="3.6" fill={hc} />}
      {st === "curly" && <g fill={hc}><circle cx="13.6" cy="13.6" r="3.2" /><circle cx="17" cy="10.6" r="3.4" /><circle cx="21" cy="9.8" r="3.5" /><circle cx="24.8" cy="11.4" r="3.3" /><circle cx="26.8" cy="14.6" r="3" /></g>}
      {st === "side" && <path d="M12.4 17C12 10.8 15.6 8 20.3 8c4.3 0 7.5 2.7 7.3 8.6-2.4-2.6-6.4-3.9-10.2-3.4-1.9.3-3.6 1.6-5 3.8z" fill={hc} />}
      <circle cx="17.2" cy="18.8" r=".95" fill="#1D1B2E" /><circle cx="22.8" cy="18.8" r=".95" fill="#1D1B2E" />
      <path d="M17.8 22.6c1.3 1 3.1 1 4.4 0" stroke={o.beard ? "#F4D9C8" : "#7A3E2A"} strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="15.6" cy="21.2" rx="1.3" ry=".8" fill="#F48B9B" opacity=".35" /><ellipse cx="24.4" cy="21.2" rx="1.3" ry=".8" fill="#F48B9B" opacity=".35" />
      {o.glasses && <g fill="none" stroke="#1D1B2E" strokeWidth=".9"><circle cx="17.2" cy="18.8" r="2.4" /><circle cx="22.8" cy="18.8" r="2.4" /><path d="M19.6 18.8h.8" /></g>}
    </svg>
  );
}

export function Avatar({ initials, name, tone = "a2" }: { initials: string; name?: string | null; tone?: string }) {
  const f = FOLK[initials];
  return f
    ? <span className={`av sm ${tone} photo`} role="img" aria-label={name ?? initials}><Face k={initials} f={f} /></span>
    : <span className={`av sm ${tone}`} title={name ?? undefined}>{initials}</span>;
}
