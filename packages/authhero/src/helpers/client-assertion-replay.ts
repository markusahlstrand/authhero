import { Context } from "hono";
import { CodeType, encodeHex } from "@authhero/adapter-interfaces";
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

/**
 * Namespaced so two issuers may legitimately use the same `jti` value while a
 * single issuer cannot reuse its own. Hashed so the stored id does not carry
 * an issuer-chosen string, and so its length is bounded by the column.
 */
async function jtiCodeId(namespace: string, jti: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${namespace}:${jti}`),
  );
  return encodeHex(digest);
}

/**
 * Record a presented token's `jti` as spent.
 *
 * @returns false when the same `(namespace, jti)` was already spent, true
 *   otherwise.
 */
export async function consumeSingleUseJti(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: {
    codeType: Extract<CodeType, "client_assertion_jti" | "subject_token_jti">;
    namespace: string;
    jti: string;
    /** The token's `exp`, in seconds — when the marker becomes collectable. */
    exp: number;
  },
): Promise<boolean> {
  const codeId = await jtiCodeId(params.namespace, params.jti);

  const existing = await ctx.env.data.codes.get(
    tenantId,
    codeId,
    params.codeType,
  );
  if (existing) return false;

  // The marker is stored already used: it records a spent token rather than a
  // credential we issued, and there is nothing left to consume. It is safe to
  // delete once the token it guards has expired, so `expires_at` is the
  // token's own `exp`.
  try {
    await ctx.env.data.codes.create(tenantId, {
      code_id: codeId,
      code_type: params.codeType,
      expires_at: new Date(params.exp * 1000).toISOString(),
      used_at: new Date().toISOString(),
    });
  } catch {
    // Lost the insert to a concurrent presentation of the same token — the
    // primary key on (code_id, code_type) makes this the atomic guard.
    return false;
  }

  return true;
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

  return consumeSingleUseJti(ctx, tenantId, {
    codeType: "client_assertion_jti",
    namespace: `client_assertion:${clientId}`,
    jti,
    exp,
  });
}
