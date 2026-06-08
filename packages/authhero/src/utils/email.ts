// Stricter than the legacy `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`: rejects leading,
// trailing, and consecutive dots in both local-part and domain, and requires
// a 2+ character alphabetic TLD. Catches common typos like `gmail..com`,
// `.user@x.com`, and `user@.gmail.com` that the senders downstream reject.
export const EMAIL_REGEX =
  /^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}
