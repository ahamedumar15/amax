// 108: the module's fixed words, in one leaf file every other file can import without a cycle.
/** Said by the screen, chat and Settings when the tenant has no GitHub app credential (AC-1). */
export const NOT_SET_UP = "GitHub isn't set up for this workspace; an Admin adds the GitHub app";

/** 116 AC-6: what an Admin or operator fixes, said instead of "I can't tell whether this was done". */
export const APP_INCOMPLETE = "The GitHub app's credential is incomplete; an Admin sets it up again with Set up the GitHub app";
export const NO_KEY_SERVICE = "amax can't store credentials yet: no key service is set (AMAX_KMS); an operator sets it";
export const callbackRefused = (url: string) => `GitHub refused amax's callback URL; an Admin pastes ${url} into the GitHub app's Redirect URIs`;

/** Review round 1 (AC-7): owners follow the repo, so a proposal named for these emails is unowned again at the next sync. */
export const OWNERS_NOTE = "proposals named for you through these emails lose you as owner at the next sync, unless their Owner line or your account email names you";

/** Final pass: what GitHub's return can come to, as a code in the URL the screen turns into these words, never free text. */
export const RESULTS = {
  connected: "GitHub connected",
  denied: "GitHub wasn't connected: you didn't approve it on GitHub",
  incomplete: "GitHub wasn't connected: GitHub didn't finish the sign-in",
  expired: "GitHub wasn't connected: that link has expired or was already used. Ask amax to connect GitHub again",
  "no-email": "GitHub wasn't connected: GitHub has no verified email for you. Verify one on GitHub, then connect again",
  "all-taken": "GitHub wasn't connected: every verified email on your GitHub is linked to another person. Ask an Admin",
  "login-taken": "GitHub wasn't connected: that GitHub login is linked to another person. Ask an Admin",
  github: "GitHub wasn't connected: GitHub didn't answer or its reply wasn't readable. Try again",
  callback: "GitHub wasn't connected: GitHub refused amax's callback URL. An Admin adds it to the GitHub app's Redirect URIs (Settings › Integrations shows it)",
  error: "GitHub wasn't connected: something went wrong. Try again",
} as const;
export type ResultCode = keyof typeof RESULTS;
