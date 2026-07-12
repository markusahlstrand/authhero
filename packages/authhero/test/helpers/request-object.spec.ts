import { describe, it, expect } from "vitest";
import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import {
  verifyRequestObject,
  RequestObjectVerificationError,
  RequestObjectClient,
} from "../../src/helpers/request-object";

const ISSUER = "https://op.example.com/";
const CLIENT_ID = "client-abc";

async function generateRsaKeypair() {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048,
    },
    true,
    ["sign", "verify"],
  );
  const privateBuffer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    privateBuffer,
    publicJwk: { ...publicJwk, kid: "test-kid", alg: "RS256", use: "sig" },
  };
}

async function generateEcKeypair() {
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateBuffer = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    privateBuffer,
    publicJwk: { ...publicJwk, kid: "ec-kid", alg: "ES256", use: "sig" },
  };
}

function clientWithJwks(
  jwk: JsonWebKey & { kid?: string },
): RequestObjectClient {
  return {
    client_id: CLIENT_ID,
    registration_metadata: { jwks: { keys: [jwk] } },
  };
}

describe("verifyRequestObject", () => {
  it("verifies a signed RS256 request object", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      {
        iss: CLIENT_ID,
        aud: ISSUER,
        scope: "openid profile",
        redirect_uri: "https://app.example.com/cb",
      },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );

    const payload = await verifyRequestObject(jwt, clientWithJwks(publicJwk), {
      issuer: ISSUER,
    });
    expect(payload).toMatchObject({
      iss: CLIENT_ID,
      aud: ISSUER,
      scope: "openid profile",
      redirect_uri: "https://app.example.com/cb",
    });
  });

  it("verifies a signed ES256 request object", async () => {
    const { privateBuffer, publicJwk } = await generateEcKeypair();
    const jwt = await createJWT(
      "ES256",
      privateBuffer,
      { iss: CLIENT_ID, aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    const payload = await verifyRequestObject(jwt, clientWithJwks(publicJwk), {
      issuer: ISSUER,
    });
    expect(payload.scope).toBe("openid");
  });

  it("verifies HS256 against client_secret", async () => {
    const client_secret = "this-is-a-shared-secret-of-reasonable-length";
    const secretBytes = new Uint8Array(new TextEncoder().encode(client_secret));
    const jwt = await createJWT(
      "HS256",
      secretBytes,
      { iss: CLIENT_ID, aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
      },
    );
    const payload = await verifyRequestObject(
      jwt,
      { client_id: CLIENT_ID, client_secret },
      { issuer: ISSUER },
    );
    expect(payload.scope).toBe("openid");
  });

  it("rejects alg=none even when payload looks well-formed", async () => {
    const header = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    );
    const payload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: CLIENT_ID,
          aud: ISSUER,
          scope: "openid",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    );
    const jwt = `${header}.${payload}.`;

    await expect(
      verifyRequestObject(jwt, { client_id: CLIENT_ID }, { issuer: ISSUER }),
    ).rejects.toMatchObject({
      name: "RequestObjectVerificationError",
      code: "unsupported_alg",
    });
  });

  it("rejects when the signature does not verify", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const otherKeypair = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { iss: CLIENT_ID, aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: otherKeypair.publicJwk.kid },
      },
    );

    // Client only knows about the *other* keypair, not the one used to sign.
    await expect(
      verifyRequestObject(jwt, clientWithJwks(otherKeypair.publicJwk), {
        issuer: ISSUER,
      }),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });

  it("rejects when the request object is expired", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      {
        iss: CLIENT_ID,
        aud: ISSUER,
        scope: "openid",
      },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(1, "s"),
        headers: { kid: publicJwk.kid },
      },
    );

    // Travel 10 minutes into the future.
    const future = Date.now() + 10 * 60 * 1000;
    await expect(
      verifyRequestObject(jwt, clientWithJwks(publicJwk), {
        issuer: ISSUER,
        now: () => future,
      }),
    ).rejects.toMatchObject({ code: "claim_invalid" });
  });

  it("rejects when iss in the request object does not match client_id", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { iss: "different-client", aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyRequestObject(jwt, clientWithJwks(publicJwk), {
        issuer: ISSUER,
      }),
    ).rejects.toMatchObject({ code: "claim_invalid" });
  });

  it("rejects when aud does not include the OP issuer", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      {
        iss: CLIENT_ID,
        aud: "https://other-op.example.com/",
        scope: "openid",
      },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyRequestObject(jwt, clientWithJwks(publicJwk), {
        issuer: ISSUER,
      }),
    ).rejects.toMatchObject({ code: "claim_invalid" });
  });

  it("rejects asymmetric alg when client has no jwks", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { iss: CLIENT_ID, aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyRequestObject(jwt, { client_id: CLIENT_ID }, { issuer: ISSUER }),
    ).rejects.toMatchObject({ code: "missing_keys" });
  });

  it("RequestObjectVerificationError is thrown for malformed JWTs", async () => {
    await expect(
      verifyRequestObject(
        "not-a-jwt",
        { client_id: CLIENT_ID },
        { issuer: ISSUER },
      ),
    ).rejects.toBeInstanceOf(RequestObjectVerificationError);
  });

  it("rejects when the registered JWK kty does not match the JWS alg", async () => {
    // Sign with RSA but advertise the EC key's kid in the header. The lookup
    // by kid will succeed, but kty=EC is not compatible with alg=RS256.
    const rsa = await generateRsaKeypair();
    const ec = await generateEcKeypair();

    const jwt = await createJWT(
      "RS256",
      rsa.privateBuffer,
      { iss: CLIENT_ID, aud: ISSUER, scope: "openid" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: ec.publicJwk.kid }, // points at the EC JWK
      },
    );

    await expect(
      verifyRequestObject(jwt, clientWithJwks(ec.publicJwk), {
        issuer: ISSUER,
      }),
    ).rejects.toMatchObject({
      name: "RequestObjectVerificationError",
      code: "missing_keys",
    });
  });

  it("rejects request objects that omit the exp claim", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    // createJWT requires expiresIn, so build the JWT manually without exp.
    const header = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid: publicJwk.kid }),
      ),
    );
    const body = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: CLIENT_ID,
          aud: ISSUER,
          scope: "openid",
          iat: Math.floor(Date.now() / 1000),
        }),
      ),
    );
    const signingInput = new TextEncoder().encode(`${header}.${body}`);
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      privateBuffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signingInput),
    );
    const jwt = `${header}.${body}.${encodeBase64Url(sig)}`;

    await expect(
      verifyRequestObject(jwt, clientWithJwks(publicJwk), {
        issuer: ISSUER,
      }),
    ).rejects.toMatchObject({
      name: "RequestObjectVerificationError",
      code: "claim_invalid",
    });
  });
});
