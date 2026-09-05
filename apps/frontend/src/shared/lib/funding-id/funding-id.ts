export type FundingId = string;

let fallbackCounter = 0;

const sanitizePrefix = (prefix: string) => {
  const sanitized = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "funding";
};

const createSuffix = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
};

export const createFundingId = (prefix = "funding"): FundingId => {
  const suffix = createSuffix();
  const safePrefix = sanitizePrefix(prefix).slice(0, Math.max(1, 63 - suffix.length));
  return `${safePrefix}-${suffix}`;
};
