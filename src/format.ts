export const currencyFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Indian-numbering compact form (lakh/crore) for KPI cards. */
export function currencyCompact(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  return currencyFull.format(amount);
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "29 Sep" — used for last-activity and created-date columns. */
export function formatShortDate(timestamp: number): string {
  return shortDate.format(timestamp);
}

/** "29 Sep 2025" — used where the year isn't otherwise implied. */
export function formatFullDate(timestamp: number): string {
  return fullDate.format(timestamp);
}

/** "New" / "3d" — the age-in-stage half of the Last activity cell. */
export function formatStageAge(days: number): string {
  const whole = Math.floor(days);
  if (whole <= 0) return "New";
  return `${whole}d`;
}
