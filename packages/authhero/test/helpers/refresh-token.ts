import type { DataAdapters } from "@authhero/adapter-interfaces";
import {
  formatRefreshToken,
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
} from "../../src/utils/refresh-token-format";

type RefreshTokenInsert = Parameters<
  DataAdapters["refreshTokens"]["create"]
>[1];

/**
 * Create a refresh-token row in the current `rt_<lookup>.<secret>` wire format
 * and return the wire token to present at `/oauth/token`.
 *
 * Tests must use this instead of writing a plain-`id` row and sending the id:
 * the legacy id-only format is rejected on the wire after `LEGACY_CUTOFF`
 * (see `src/utils/refresh-token-format.ts`), so id-only fixtures resolve to
 * `invalid_grant` once that date passes.
 */
export async function createTestRefreshToken(
  env: { data: DataAdapters },
  tenantId: string,
  row: RefreshTokenInsert,
): Promise<{ wireToken: string; lookup: string; secret: string }> {
  const { lookup, secret } = generateRefreshTokenParts();
  const token_hash = await hashRefreshTokenSecret(secret);
  await env.data.refreshTokens.create(tenantId, {
    ...row,
    token_lookup: lookup,
    token_hash,
  });
  return { wireToken: formatRefreshToken(lookup, secret), lookup, secret };
}
