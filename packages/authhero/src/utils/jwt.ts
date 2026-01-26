import { z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { decode, verify } from "hono/jwt";
import { getJwksFromDatabase } from "./jwks";
import { Bindings } from "../types";

const JwksKeySchema = z.object({
  alg: z.enum([
    "RS256",
    "RS384",
    "RS512",
    "ES256",
    "ES384",
    "ES512",
    "HS256",
    "HS384",
    "HS512",
  ]),
  kty: z.enum(["RSA", "EC", "oct"]),
  use: z.enum(["sig", "enc"]).optional(),
  n: z.string(),
  e: z.string(),
  kid: z.string(),
  x5t: z.string().optional(),
  x5c: z.array(z.string()).optional(),
});

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
        .object({ keys: z.array(JwksKeySchema) })
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

export async function validateJwtToken(
  ctx: Context,
  token: string,
): Promise<JwtPayload> {
  try {
    const { header } = decode(token);

    const jwksKeys = await getJwks(ctx.env);
    const jwksKey = jwksKeys.find((key) => key.kid === header.kid);

    if (!jwksKey) {
      throw new JSONHTTPException(401, { message: "No matching kid found" });
    }

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwksKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const verifiedPayload = await verify(token, cryptoKey, "RS256");

    return verifiedPayload as unknown as JwtPayload;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new JSONHTTPException(403, { message: "Invalid JWT signature" });
  }
}
