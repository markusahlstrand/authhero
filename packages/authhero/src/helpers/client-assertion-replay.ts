import { Context } from "hono";
import { encodeHex } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

/**
 * Single-use enforcement for RFC 7523 client assertions.
 *
 * `verifyClientAssertion` proves an assertion was signed by the client and is
 * inside its validity window, but nothing in that stops the same assertion
 * being presented again — so a captured assertion authenticates the client for
 * as long as it is unexpired. Spending its `jti` here closes that.
 *
 * Backed by the codes adapter rather than the cache adapter: `codes.create` is
 * a plain insert against a `(code_id, code_type)` primary key, so the second
 * concurrent presentation of the same assertion loses the insert rather than
 * racing a read-then-write (which is all `CacheAdapter`'s get/set could offer).
 * Codes are tenant-scoped and already have a retention sweep wired to the
 * scheduled handler, so nothing new has to clean these rows up.
 */

const CODE_TYPE = "client_assertion_jti" as const;

/**
 * Namespaced so two clients may legitimately use the same `jti` value while a
 * single client cannot reuse its own. Hashed so the stored id does not carry a
 * client-chosen string, and so its length is bounded by the column.
 */
async function assertionJtiCodeId(
  clientId: string,
  jti: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`client_assertion:${clientId}:${jti}`),
  );
  return encodeHex(digest);
}

export interface ConsumeClientAssertionJtiParams {
  clientId: string;
  /** The assertion's `jti`. When absent there is nothing to spend. */
  jti?: string;
  /** The assertion's `exp`, in seconds — when the marker becomes collectable. */
  exp: number;
}

/**
 * Spend a client assertion's `jti`.
 *
 * @returns false when this assertion has already been presented (the caller
 *   must reject it as `invalid_client`), true otherwise. An assertion carrying
 *   no `jti` cannot be tracked, so it returns true — its replay window is
 *   bounded only by the assertion lifetime cap.
 */
export async function consumeClientAssertionJti(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: ConsumeClientAssertionJtiParams,
): Promise<boolean> {
  const { clientId, jti, exp } = params;
  if (!jti) return true;

  const codeId = await assertionJtiCodeId(clientId, jti);

  const existing = await ctx.env.data.codes.get(tenantId, codeId, CODE_TYPE);
  if (existing) return false;

  // The marker is stored already used: it records a spent assertion rather
  // than a credential we issued, and there is nothing left to consume. It is
  // safe to delete once the assertion it guards has expired, so `expires_at`
  // is the assertion's own `exp`.
  const usedAt = new Date().toISOString();
  try {
    await ctx.env.data.codes.create(tenantId, {
      code_id: codeId,
      code_type: CODE_TYPE,
      expires_at: new Date(exp * 1000).toISOString(),
      used_at: usedAt,
    });
  } catch {
    // Lost the insert to a concurrent presentation of the same assertion —
    // the primary key on (code_id, code_type) makes this the atomic guard.
    return false;
  }

  return true;
}
