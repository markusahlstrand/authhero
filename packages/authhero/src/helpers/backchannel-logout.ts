import { Context } from "hono";
import { Session } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { signJWT } from "../utils/jwt";
import { pemToBuffer } from "../utils/crypto";
import { algForCert } from "../utils/jwk-alg";
import { resolveSigningKeys } from "./signing-keys";
import { getIssuer } from "../variables";
import {
  assertSsrfSafeUrl,
  ssrfFetchOptionsFromEnv,
} from "../utils/ssrf-fetch";
import { waitUntil } from "./wait-until";

// OIDC Back-Channel Logout 1.0
// https://openid.net/specs/openid-connect-backchannel-1_0.html

// §2.4 — logout tokens are consumed immediately; keep the window short so a
// leaked token can't be replayed against an RP long after the logout.
const LOGOUT_TOKEN_LIFETIME_SECONDS = 120;
const DELIVERY_TIMEOUT_MS = 5000;

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

type BackchannelSession = Pick<Session, "id" | "user_id" | "clients">;

/**
 * Notify every RP that participated in `session` and registered
 * `oidc_logout.backchannel_logout_urls` that the session has ended, by
 * POSTing a signed logout token (§2.5) to each registered URL.
 *
 * Delivery is best-effort and runs in the background (`waitUntil`): a dead RP
 * endpoint must never block or fail the logout that triggered it. Call this
 * AFTER the session revocation has committed, so an RP that reacts to the
 * token by hitting the OP observes the session as already gone.
 */
export function sendBackchannelLogout(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  session: BackchannelSession,
): void {
  waitUntil(
    ctx,
    deliverBackchannelLogout(ctx, tenant_id, session).catch((err) => {
      console.warn(
        `backchannel logout delivery failed for session ${session.id}:`,
        err,
      );
    }),
  );
}

async function deliverBackchannelLogout(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenant_id: string,
  session: BackchannelSession,
): Promise<void> {
  const clientIds = [...new Set(session.clients ?? [])];
  if (clientIds.length === 0) return;

  const targets: { client_id: string; url: string }[] = [];
  for (const client_id of clientIds) {
    const client = await ctx.env.data.clients
      .get(tenant_id, client_id)
      .catch(() => null);
    for (const url of client?.oidc_logout?.backchannel_logout_urls ?? []) {
      targets.push({ client_id, url });
    }
  }
  if (targets.length === 0) return;

  const resolvedKeys = await resolveSigningKeys(
    ctx.env.data.keys,
    tenant_id,
    ctx.env.signingKeyMode,
    { purpose: "sign" },
  );
  const signingKey = resolvedKeys[0];
  if (!signingKey?.pkcs7 || !signingKey.cert) {
    console.warn(
      "backchannel logout skipped: no signing key available for tenant",
      tenant_id,
    );
    return;
  }
  const keyBuffer = pemToBuffer(signingKey.pkcs7);
  const signingAlg = await algForCert(signingKey.cert);
  const iss = getIssuer(ctx.env, ctx.var.custom_domain);
  const ssrfOpts = ssrfFetchOptionsFromEnv(ctx.env);

  await Promise.all(
    targets.map(async ({ client_id, url }) => {
      try {
        // §2.4 logout token. Contains both sub and sid (we always bind
        // sessions to a user), and — per spec — MUST NOT contain a nonce so
        // it can never be replayed as an ID token.
        const logout_token = await signJWT(
          signingAlg,
          keyBuffer,
          {
            iss,
            aud: client_id,
            sub: session.user_id,
            sid: session.id,
            jti: nanoid(),
            events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
          },
          {
            includeIssuedTimestamp: true,
            expiresInSeconds: LOGOUT_TOKEN_LIFETIME_SECONDS,
            headers: { kid: signingKey.kid, typ: "logout+jwt" },
          },
        );

        const target = assertSsrfSafeUrl(url, ssrfOpts);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
        try {
          const response = await fetch(target, {
            method: "POST",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "cache-control": "no-store",
            },
            body: new URLSearchParams({ logout_token }).toString(),
          });
          if (!response.ok) {
            console.warn(
              `backchannel logout: ${url} responded ${response.status} for client ${client_id}`,
            );
          }
          // Release the connection; the response body carries no meaning
          // (§2.8 — the RP signals the outcome via status code alone).
          await response.body?.cancel();
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        console.warn(
          `backchannel logout: delivery to ${url} failed for client ${client_id}:`,
          err,
        );
      }
    }),
  );
}
