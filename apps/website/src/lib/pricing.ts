// Single source of truth for every pricing number on the site.
//
// All prices, MAU thresholds, overage rates and SSO counts live here so they
// can be changed in one place. The values below are PLACEHOLDERS — adjust them
// and the pricing page, comparison table and FAQ update automatically.

export const CURRENCY = "€";

/** Self-hosted Commercial / Sovereign tier — flat annual license. */
export const COMMERCIAL_LICENSE_PER_YEAR = 5_000;

/** AuthHero Cloud (managed, on Cloudflare). */
export const CLOUD = {
  free: {
    /** Monthly active users included on the free tier. */
    mau: 10_000,
    ssoConnections: 1,
  },
  pro: {
    /** Flat monthly base fee. */
    basePerMonth: 39,
    /** MAU included in the base fee before overage applies. */
    includedMau: 50_000,
    /** Linear overage per MAU above the included amount — no tiered cliffs. */
    mauOverage: 0.02,
    ssoConnections: 3,
  },
} as const;

// --- Formatting helpers -----------------------------------------------------

/** "10,000" → "10k", "50,000" → "50k", "1,500,000" → "1.5M". */
export const formatMau = (mau: number): string => {
  if (mau >= 1_000_000) return `${(mau / 1_000_000).toLocaleString("en-US")}M`;
  if (mau >= 1_000) return `${(mau / 1_000).toLocaleString("en-US")}k`;
  return mau.toLocaleString("en-US");
};

/** A whole-euro amount, e.g. 5000 → "€5,000". */
export const formatPrice = (amount: number): string =>
  `${CURRENCY}${amount.toLocaleString("en-US")}`;

/** A per-MAU rate that may be sub-cent, e.g. 0.02 → "€0.02". */
export const formatRate = (amount: number): string =>
  `${CURRENCY}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/**
 * Cloud Pro monthly cost at a given MAU count: flat base plus LINEAR overage
 * on every MAU above the included amount. No step jumps between brackets.
 */
export const proMonthlyCost = (mau: number): number => {
  const { basePerMonth, includedMau, mauOverage } = CLOUD.pro;
  const overageMau = Math.max(0, mau - includedMau);
  return basePerMonth + overageMau * mauOverage;
};
