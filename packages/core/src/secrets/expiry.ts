// 052, 116: the one rule for keeping a credential's expiry when its value is replaced. A future date or no date is kept;
// a past one can't be, since dropping it would leave a credential that never expires and never shows as Expiring again.
export class ExpiryPassedError extends Error {
  override name = "ExpiryPassedError";
  constructor(connector: string, expiresAt: Date) {
    super(`the ${connector} credential's expiry (${expiresAt.toISOString().slice(0, 10)}) has passed; give a new expiresAt for the replaced value`);
  }
}

export function keptExpiry(connector: string, expiresAt: Date | null, now = new Date()): string | null {
  if (!expiresAt) return null;
  if (expiresAt > now) return expiresAt.toISOString();
  throw new ExpiryPassedError(connector, expiresAt);
}

/** 116: said when no key service is set, by every tool that stores a credential. */
export const NO_KEY_SERVICE = "amax can't store credentials yet: no key service is set (AMAX_KMS); an operator sets it";
