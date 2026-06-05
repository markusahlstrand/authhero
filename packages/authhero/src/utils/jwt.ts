import { z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { jwksSchema } from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { decode, verify } from "hono/jwt";
import { getJwksFromDatabase } from "./jwks";
import { Bindings } from "../types";
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

async function getJwks(bindings: Bindings) {
  if (bindings.JWKS_URL && bindings.JWKS_SERVICE) {
    try {
      const response = await bindings.JWKS_SERVICE.fetch(bindings.JWKS_URL);

      if (!response.ok) {
        console.warn(
          `JWKS fetch failed with status ${response.status}, falling back to database`,
        );
        return await getJwksFromDatabase(bindings.data);
      }

      const responseBody = await response.json();
      const parsed = z
        .object({ keys: z.array(jwksSchema) })
        .parse(responseBody);

      return parsed.keys;
    } catch (error) {
      console.warn(
        `JWKS fetch error: ${error instanceof Error ? error.message : "Unknown error"}, falling back to database`,
      );
      return await getJwksFromDatabase(bindings.data);
    }
  }

  return await getJwksFromDatabase(bindings.data);
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

    const jwksKeys = await getJwks(ctx.env);
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

    const verifiedPayload = await verify(token, cryptoKey, alg);

    return verifiedPayload as unknown as JwtPayload;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new JSONHTTPException(403, { message: "Invalid JWT signature" });
  }
}
