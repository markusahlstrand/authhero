import { describe, it, expect } from "vitest";
import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import {
  verifyClientAssertion,
  ClientAssertionError,
  ClientAssertionClient,
  CLIENT_ASSERTION_TYPE,
} from "../../src/helpers/client-assertion";

const CLIENT_ID = "client-abc";
const TOKEN_ENDPOINT = "https://op.example.com/oauth/token";
const ISSUER = "https://op.example.com/";

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
    publicJwk: { ...publicJwk, kid: "client-kid", alg: "RS256", use: "sig" },
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
): ClientAssertionClient {
  return {
    client_id: CLIENT_ID,
    registration_metadata: { jwks: { keys: [jwk] } },
  };
}

const standardClaims = () => ({
  iss: CLIENT_ID,
  sub: CLIENT_ID,
  aud: TOKEN_ENDPOINT,
  jti: `jti-${Math.random().toString(36).slice(2)}`,
});

describe("verifyClientAssertion (RFC 7523)", () => {
  it("verifies a valid private_key_jwt assertion (RS256)", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT("RS256", privateBuffer, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(5, "m"),
      headers: { kid: publicJwk.kid },
    });
    const verified = await verifyClientAssertion(
      jwt,
      clientWithJwks(publicJwk),
      { acceptedAudiences: [TOKEN_ENDPOINT, ISSUER] },
    );
    expect(verified.method).toBe("private_key_jwt");
    expect(verified.clientId).toBe(CLIENT_ID);
    expect(verified.jti).toBeTruthy();
  });

  it("verifies a valid private_key_jwt assertion (ES256)", async () => {
    const { privateBuffer, publicJwk } = await generateEcKeypair();
    const jwt = await createJWT("ES256", privateBuffer, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(5, "m"),
      headers: { kid: publicJwk.kid },
    });
    const verified = await verifyClientAssertion(
      jwt,
      clientWithJwks(publicJwk),
      { acceptedAudiences: [TOKEN_ENDPOINT] },
    );
    expect(verified.method).toBe("private_key_jwt");
  });

  it("verifies a client_secret_jwt assertion (HS256)", async () => {
    const client_secret = "shared-secret-of-reasonable-length-here";
    const secretBytes = new Uint8Array(new TextEncoder().encode(client_secret));
    const jwt = await createJWT("HS256", secretBytes, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(5, "m"),
    });
    const verified = await verifyClientAssertion(
      jwt,
      { client_id: CLIENT_ID, client_secret },
      { acceptedAudiences: [TOKEN_ENDPOINT] },
    );
    expect(verified.method).toBe("client_secret_jwt");
  });

  it("rejects alg=none", async () => {
    const header = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "JWT" })),
    );
    const payload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          ...standardClaims(),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ),
    );
    await expect(
      verifyClientAssertion(
        `${header}.${payload}.`,
        { client_id: CLIENT_ID },
        { acceptedAudiences: [TOKEN_ENDPOINT] },
      ),
    ).rejects.toMatchObject({ code: "unsupported_alg" });
  });

  it("rejects when iss != client_id", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { ...standardClaims(), iss: "other-client" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyClientAssertion(jwt, clientWithJwks(publicJwk), {
        acceptedAudiences: [TOKEN_ENDPOINT],
      }),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("rejects when sub != client_id", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { ...standardClaims(), sub: "different-sub" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyClientAssertion(jwt, clientWithJwks(publicJwk), {
        acceptedAudiences: [TOKEN_ENDPOINT],
      }),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("rejects when aud doesn't match", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { ...standardClaims(), aud: "https://other-op.example.com/oauth/token" },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    await expect(
      verifyClientAssertion(jwt, clientWithJwks(publicJwk), {
        acceptedAudiences: [TOKEN_ENDPOINT, ISSUER],
      }),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("accepts aud as an array containing one of the accepted audiences", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer,
      { ...standardClaims(), aud: ["https://other.example/", TOKEN_ENDPOINT] },
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: publicJwk.kid },
      },
    );
    const verified = await verifyClientAssertion(
      jwt,
      clientWithJwks(publicJwk),
      { acceptedAudiences: [TOKEN_ENDPOINT] },
    );
    expect(verified.clientId).toBe(CLIENT_ID);
  });

  it("rejects expired assertions", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT("RS256", privateBuffer, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(1, "s"),
      headers: { kid: publicJwk.kid },
    });
    const future = Date.now() + 10 * 60 * 1000;
    await expect(
      verifyClientAssertion(jwt, clientWithJwks(publicJwk), {
        acceptedAudiences: [TOKEN_ENDPOINT],
        now: () => future,
      }),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("rejects when signed with a different key than the client owns", async () => {
    const { privateBuffer } = await generateRsaKeypair();
    const other = await generateRsaKeypair();
    const jwt = await createJWT(
      "RS256",
      privateBuffer, // signs with our key
      standardClaims(),
      {
        includeIssuedTimestamp: true,
        expiresIn: new TimeSpan(5, "m"),
        headers: { kid: other.publicJwk.kid }, // pretends to be the other key
      },
    );
    await expect(
      verifyClientAssertion(jwt, clientWithJwks(other.publicJwk), {
        acceptedAudiences: [TOKEN_ENDPOINT],
      }),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("rejects RS256 when client has no jwks registered", async () => {
    const { privateBuffer, publicJwk } = await generateRsaKeypair();
    const jwt = await createJWT("RS256", privateBuffer, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(5, "m"),
      headers: { kid: publicJwk.kid },
    });
    await expect(
      verifyClientAssertion(
        jwt,
        { client_id: CLIENT_ID },
        { acceptedAudiences: [TOKEN_ENDPOINT] },
      ),
    ).rejects.toMatchObject({ code: "missing_keys" });
  });

  it("rejects HS256 when client has no client_secret", async () => {
    const secretBytes = new Uint8Array(new TextEncoder().encode("foo"));
    const jwt = await createJWT("HS256", secretBytes, standardClaims(), {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(5, "m"),
    });
    await expect(
      verifyClientAssertion(
        jwt,
        { client_id: CLIENT_ID },
        { acceptedAudiences: [TOKEN_ENDPOINT] },
      ),
    ).rejects.toMatchObject({ code: "invalid_client" });
  });

  it("rejects malformed JWTs", async () => {
    await expect(
      verifyClientAssertion(
        "not-a-jwt",
        { client_id: CLIENT_ID },
        { acceptedAudiences: [TOKEN_ENDPOINT] },
      ),
    ).rejects.toBeInstanceOf(ClientAssertionError);
  });

  it("exports the correct CLIENT_ASSERTION_TYPE constant", () => {
    expect(CLIENT_ASSERTION_TYPE).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
  });
});
