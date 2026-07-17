import type { User } from "@authhero/adapter-interfaces";

// Deterministic, self-hosted avatar generation. When a user has no `picture`
// of their own we fall back to a generated SVG served by the `/avatars`
// endpoint so that consumers (the management API, /userinfo, ID Tokens, the
// admin UI) can always rely on `picture` being present — no client-side
// fallback required. The palette and hashing match what the admin UI used to
// render locally, so the look is unchanged.
const AVATAR_COLORS = [
  "1F77B4",
  "FF7F0E",
  "2CA02C",
  "D62728",
  "9467BD",
  "8C564B",
  "E377C2",
  "17BECF",
  "BCBD22",
  "7F7F7F",
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// The string a user's avatar color is derived from. Stable per identity so the
// same user always gets the same color.
function getAvatarSeed(user: Partial<User>): string {
  return user.email || user.name || user.user_id || "?";
}

// Hex color (no leading `#`) for a seed, picked deterministically from the
// palette above.
export function getAvatarColor(seed: string): string {
  const key = seed.length > 0 ? seed : "?";
  return AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length] ?? "7F7F7F";
}

// Up to two uppercased initials derived from the best available display name.
export function getAvatarInitials(user: Partial<User>): string {
  const source =
    user.name?.trim() ||
    `${user.given_name ?? ""} ${user.family_name ?? ""}`.trim() ||
    user.nickname?.trim() ||
    user.email?.trim() ||
    user.username?.trim() ||
    "";

  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
}

// Joins an issuer (which may or may not end with a slash) with a path without
// touching the issuer's own representation — see the issuer-trailing-slash
// guidance: the `iss` claim must stay byte-exact, but URLs we build off it can
// be normalized safely here.
function joinIssuer(issuer: string, path: string): string {
  return `${issuer.endsWith("/") ? issuer : `${issuer}/`}${path}`;
}

// URL of the generated SVG avatar for a user, served by the `/avatars`
// endpoint. Only non-PII derived data (initials + a palette color) is encoded
// into the URL, so it is safe to embed in tokens and API responses.
export function getDefaultUserPicture(
  issuer: string,
  user: Partial<User>,
): string {
  const initials = getAvatarInitials(user);
  const color = getAvatarColor(getAvatarSeed(user));
  return joinIssuer(
    issuer,
    `avatars/${encodeURIComponent(initials)}.svg?bg=${color}`,
  );
}

// Returns the user with `picture` guaranteed to be set — its own picture when
// present, otherwise the generated default. Returns a copy; the input is not
// mutated.
export function withDefaultPicture<T extends Partial<User>>(
  user: T,
  issuer: string,
): T {
  if (user.picture) return user;
  return { ...user, picture: getDefaultUserPicture(issuer, user) };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Renders a square SVG avatar: a solid palette-colored background with the
// given initials centered in white. `bg` is a 6-digit hex color without `#`;
// anything else falls back to the neutral gray so the endpoint can't be used
// to inject arbitrary markup.
export function renderAvatarSvg(text: string, bg: string): string {
  const color = /^[0-9a-fA-F]{6}$/.test(bg) ? `#${bg}` : "#7F7F7F";
  const label = escapeXml(text.slice(0, 2).toUpperCase()) || "?";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" role="img">`,
    `<rect width="120" height="120" fill="${color}"/>`,
    `<text x="50%" y="50%" dy=".05em" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="52" font-weight="600" text-anchor="middle" dominant-baseline="central">${label}</text>`,
    `</svg>`,
  ].join("");
}
