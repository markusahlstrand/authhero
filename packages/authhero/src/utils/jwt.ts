import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { decode, verify } from "hono/jwt";
import { getJwksForVerification } from "./jwks";
import { getIssuer } from "../variables";
import { importParamsForJwk, SupportedAlg } from "./jwk-alg";

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  scope: string;
  permissions?: string[];
  azp?: string;
  tenant_id?: string;
  org_id?: string;
  org_name?: string;
  // RFC 8693 §4.1 — present on tokens minted via a delegated flow.
  act?: { sub: string; client_id?: string };
}

function toSupportedAlg(alg: unknown): SupportedAlg {
  switch (alg) {
    case "RS256":
    case "RS384":
    case "RS512":
    case "ES256":
    case "ES384":
    case "ES512":
      return alg;
    default:
      throw new JSONHTTPException(401, {
        message: `Unsupported JWS alg: ${alg ?? "(missing)"}`,
      });
  }
}

export async function validateJwtToken(
  ctx: Context,
  token: string,
): Promise<JwtPayload> {
  try {
    const { header } = decode(token);
    const alg = toSupportedAlg(header?.alg);

    // Scope verification to the tenant resolved from the request. Loading the
    // global keyset would let a token signed for tenant A verify against
    // tenant B's API (matching kid), even though A's iss wouldn't match B's
    // host — checked below as a second line of defense.
    const jwksKeys = await getJwksForVerification(
      ctx.env.data,
      ctx.var.tenant_id,
      ctx.env.signingKeyMode,
    );
    const jwksKey = jwksKeys.find((key) => key.kid === header.kid);

    if (!jwksKey) {
      throw new JSONHTTPException(401, { message: "No matching kid found" });
    }

    // The JWK's published alg is authoritative. Reject tokens whose header
    // alg differs (or where the JWK didn't bind itself to an alg) so an
    // attacker can't reuse a kid to verify with an alg the key wasn't
    // intended for.
    if (jwksKey.alg !== alg) {
      throw new JSONHTTPException(401, {
        message: "alg mismatch between token header and JWK",
      });
    }

    const importParams = importParamsForJwk(jwksKey, alg);
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwksKey,
      importParams,
      false,
      ["verify"],
    );

    const verifiedPayload = (await verify(
      token,
      cryptoKey,
      alg,
    )) as unknown as JwtPayload;

    // Pin the token to the host it was issued for. A custom-domain tenant
    // mints tokens with iss=https://<custom-domain>/; the canonical control
    // plane uses env.ISSUER. Without this check, a kid that appears in both
    // keysets (e.g. control-plane fallback during tenant key rollout) would
    // let a token issued on host A authenticate on host B.
    const expectedIssuer = getIssuer(ctx.env, ctx.var.custom_domain);
    if (verifiedPayload.iss !== expectedIssuer) {
      throw new JSONHTTPException(401, { message: "Invalid issuer" });
    }

    return verifiedPayload;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new JSONHTTPException(403, { message: "Invalid JWT signature" });
  }
}
