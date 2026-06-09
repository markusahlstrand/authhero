import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { parseJWT } from "oslo/jwt";
import {
  jwksKeySchema,
  openIDConfigurationSchema,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { createX509Certificate } from "../../../src/utils/encryption";

interface TokenResponse {
  access_token: string;
}

async function verifyJwtWithJwk(
  jwt: string,
  jwk: JsonWebKey,
): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = jwt.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return false;
  }

  const header = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      ),
    ),
  );

  const importParams =
    jwk.kty === "EC"
      ? { name: "ECDSA", namedCurve: jwk.crv ?? "P-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

  const verifyParams =
    jwk.kty === "EC"
      ? {
          name: "ECDSA",
          hash:
            jwk.crv === "P-384"
              ? "SHA-384"
              : jwk.crv === "P-521"
                ? "SHA-512"
                : "SHA-256",
        }
      : { name: "RSASSA-PKCS1-v1_5" };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    importParams,
    false,
    ["verify"],
  );

  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  // Sanity-check the alg header matches what the JWK advertises.
  if (
    jwk.kty === "EC" &&
    header.alg !== "ES256" &&
    header.alg !== "ES384" &&
    header.alg !== "ES512"
  ) {
    return false;
  }
  if (jwk.kty === "RSA" && header.alg !== "RS256") {
    return false;
  }

  return crypto.subtle.verify(verifyParams, cryptoKey, signature, data);
}

describe("signing algorithms", () => {
  it("advertises RS256 + ES256/384/512 in id_token_signing_alg_values_supported", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.id_token_signing_alg_values_supported).toEqual(
      expect.arrayContaining(["RS256", "ES256", "ES384", "ES512"]),
    );
  });

  it("publishes an RSA JWK with alg=RS256 and kty=RSA by default", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["jwks.json"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );

    const body = jwksKeySchema.parse(await response.json());
    expect(body.keys.length).toBeGreaterThan(0);
    const rsaKey = body.keys[0];
    expect(rsaKey?.kty).toBe("RSA");
    expect(rsaKey?.alg).toBe("RS256");
    expect(rsaKey?.use).toBe("sig");
    expect(rsaKey?.n).toBeTruthy();
    expect(rsaKey?.e).toBeTruthy();
  });

  it("publishes an EC P-256 key with alg=ES256, kty=EC, crv=P-256, x and y", async () => {
    const { oauthApp, env } = await getTestServer();

    // Add an EC signing key alongside the default RSA one.
    const ecKey = await createX509Certificate({
      name: "CN=ec-test",
      keyType: "EC-P-256",
    });
    await env.data.keys.create(ecKey);

    const client = testClient(oauthApp, env);
    const response = await client[".well-known"]["jwks.json"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );

    const body = jwksKeySchema.parse(await response.json());
    const ec = body.keys.find((k) => k.kid === ecKey.kid);
    expect(ec).toBeDefined();
    expect(ec?.kty).toBe("EC");
    expect(ec?.alg).toBe("ES256");
    expect(ec?.crv).toBe("P-256");
    expect(ec?.x).toBeTruthy();
    expect(ec?.y).toBeTruthy();
    expect(ec?.use).toBe("sig");
  });

  it("issues an ES256-signed token when the active signing key is EC P-256", async () => {
    const { oauthApp, env } = await getTestServer();

    // Revoke the default RSA key and replace with an EC one so the EC key
    // becomes the only active signing key.
    const initial = await env.data.keys.list({ q: "type:jwt_signing" });
    for (const k of initial.signingKeys) {
      await env.data.keys.update(k.kid, {
        revoked_at: new Date(Date.now() - 60_000).toISOString(),
      });
    }

    const ecKey = await createX509Certificate({
      name: "CN=ec-test",
      keyType: "EC-P-256",
    });
    await env.data.keys.create(ecKey);

    const client = testClient(oauthApp, env);
    const tokenResponse = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(tokenResponse.status).toBe(200);
    const body = (await tokenResponse.json()) as TokenResponse;

    const parsed = parseJWT(body.access_token);
    expect(parsed?.header).toMatchObject({
      alg: "ES256",
      kid: ecKey.kid,
      typ: "JWT",
    });

    const jwksResponse = await client[".well-known"]["jwks.json"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );
    const jwks = jwksKeySchema.parse(await jwksResponse.json());
    const matchingJwk = jwks.keys.find((k) => k.kid === ecKey.kid);
    expect(matchingJwk).toBeDefined();

    const verified = await verifyJwtWithJwk(body.access_token, matchingJwk!);
    expect(verified).toBe(true);
  });
});
