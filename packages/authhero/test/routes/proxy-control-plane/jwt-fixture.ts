type JWK = JsonWebKey;

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(obj)));
}

const ALG_HASH: Record<string, string> = {
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
};
const EC_CURVE: Record<string, string> = {
  ES256: "P-256",
  ES384: "P-384",
  ES512: "P-521",
};

export type TestAlg = "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";

export interface SignJwtOptions {
  payload: Record<string, unknown>;
  /** Override `alg` in the header (defaults to keyset's alg). */
  headerAlg?: string;
  /** Override `kid` in the header (or pass `null` to omit it). */
  kid?: string | null;
  /** Override the JWK's published `alg` (useful for jwk/header mismatch tests). */
  jwkAlg?: string;
}

export interface TestKeyset {
  alg: TestAlg;
  kid: string;
  jwksUrl: string;
  jwksFetch: (url: string) => Promise<Response>;
  publicJwk: JWK & { kid: string; alg: string; use: "sig" };
  sign(options: SignJwtOptions): Promise<string>;
}

/**
 * Mint a single-key JWKS + a signing function for tests. The returned
 * `jwksFetch` answers `jwksUrl` with `{ keys: [publicJwk] }`; the `sign`
 * helper builds compact JWS tokens with overridable header fields so tests
 * can exercise mismatch cases (wrong alg, missing kid, …).
 */
export async function createTestKeyset(
  options: { alg?: TestAlg; kid?: string; jwksUrl?: string } = {},
): Promise<TestKeyset> {
  const alg = options.alg ?? "RS256";
  const kid = options.kid ?? `test-kid-${alg}`;
  const jwksUrl =
    options.jwksUrl ?? "https://issuer.example.test/.well-known/jwks.json";

  const isRsa = alg.startsWith("RS");
  const keyPair = isRsa
    ? await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: ALG_HASH[alg]!,
        },
        true,
        ["sign", "verify"],
      )
    : await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: EC_CURVE[alg]! },
        true,
        ["sign", "verify"],
      );

  const exportedPublic = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as JWK;
  const publicJwk: JWK & { kid: string; alg: string; use: "sig" } = {
    ...exportedPublic,
    kid,
    alg,
    use: "sig",
  };

  async function signRaw(
    headerObj: Record<string, unknown>,
    payload: Record<string, unknown>,
    headerAlg: string,
  ): Promise<string> {
    const signingInput = `${base64UrlEncodeJson(headerObj)}.${base64UrlEncodeJson(payload)}`;
    const data = encoder.encode(signingInput);
    const signature = isRsa
      ? await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, data)
      : await crypto.subtle.sign(
          { name: "ECDSA", hash: ALG_HASH[alg]! },
          keyPair.privateKey,
          data,
        );
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  return {
    alg,
    kid,
    jwksUrl,
    publicJwk,
    jwksFetch: async (url: string) => {
      if (url !== jwksUrl) {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    sign: async ({ payload, headerAlg, kid: kidOverride, jwkAlg }) => {
      const tokenAlg: string = headerAlg ?? alg;
      const header: Record<string, unknown> = { alg: tokenAlg, typ: "JWT" };
      if (kidOverride === null) {
        // omit kid
      } else if (kidOverride !== undefined) {
        header.kid = kidOverride;
      } else {
        header.kid = kid;
      }
      // For mismatch tests where the JWK's `alg` should differ from the
      // token header's `alg`, override the published JWK alg before signing.
      // The signature itself always uses the keyset's real alg.
      if (jwkAlg !== undefined) {
        publicJwk.alg = jwkAlg;
      }
      return signRaw(header, payload, tokenAlg);
    },
  };
}
