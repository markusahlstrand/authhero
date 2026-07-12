import { encodeBase64Url, encodeHex } from "@authhero/adapter-interfaces";

export const REFRESH_TOKEN_PREFIX = "rt_";
export const LOOKUP_BYTES = 7;
export const SECRET_BYTES = 32;

// After this date the legacy (un-prefixed, id-only) refresh-token format is
// rejected on the wire. Originally 2026-06-05; pushed to 2026-08-04 when
// the first cutoff fired and prod still had non-rotating legacy rows that
// the rotation migration never touched. Those rows are now upgraded in
// place on first refresh (see refresh-token.ts non-rotating branch), so the
// window only needs to cover one full max-age cycle for active clients to
// trigger the upgrade.
export const LEGACY_CUTOFF = new Date("2026-08-04T00:00:00.000Z");

export type ParsedRefreshToken =
  | { kind: "new"; lookup: string; secret: string }
  | { kind: "legacy"; id: string };

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateRefreshTokenParts(): {
  lookup: string;
  secret: string;
} {
  return {
    lookup: encodeBase64Url(randomBytes(LOOKUP_BYTES)),
    secret: encodeBase64Url(randomBytes(SECRET_BYTES)),
  };
}

export async function hashRefreshTokenSecret(secret: string): Promise<string> {
  return encodeHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
  );
}

export function formatRefreshToken(lookup: string, secret: string): string {
  return `${REFRESH_TOKEN_PREFIX}${lookup}.${secret}`;
}

export function parseRefreshToken(token: string): ParsedRefreshToken {
  if (token.startsWith(REFRESH_TOKEN_PREFIX)) {
    const body = token.slice(REFRESH_TOKEN_PREFIX.length);
    const dot = body.indexOf(".");
    if (dot > 0 && dot < body.length - 1) {
      return {
        kind: "new",
        lookup: body.slice(0, dot),
        secret: body.slice(dot + 1),
      };
    }
  }
  return { kind: "legacy", id: token };
}

export function isLegacyRefreshTokenAccepted(now: Date = new Date()): boolean {
  return now < LEGACY_CUTOFF;
}
