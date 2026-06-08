import { describe, it, expect } from "vitest";
import { PROXY_RESOLVE_HOST_SCOPE } from "@authhero/proxy";
import {
  isAllowedIssuer,
  verifyControlPlaneToken,
} from "../../../src/routes/proxy-control-plane/verify";
import { createTestKeyset } from "./jwt-fixture";

const ISSUER = "https://issuer.example.test/";

describe("isAllowedIssuer", () => {
  it("treats trailing-slash-only differences as equal", () => {
    expect(
      isAllowedIssuer(
        "https://issuer.example.test/",
        "https://issuer.example.test",
      ),
    ).toBe(true);
  });

  it("rejects different subdomains", () => {
    expect(
      isAllowedIssuer(
        "https://evil.example.test/",
        "https://issuer.example.test/",
      ),
    ).toBe(false);
  });

  it("rejects different paths", () => {
    expect(
      isAllowedIssuer(
        "https://issuer.example.test/tenant-x/",
        "https://issuer.example.test/",
      ),
    ).toBe(false);
  });

  it("rejects different schemes", () => {
    expect(
      isAllowedIssuer(
        "http://issuer.example.test/",
        "https://issuer.example.test/",
      ),
    ).toBe(false);
  });

  it("rejects unparseable issuers", () => {
    expect(isAllowedIssuer("not-a-url", "https://issuer.example.test/")).toBe(
      false,
    );
  });
});

describe("verifyControlPlaneToken", () => {
  it("accepts a well-formed token with the right issuer + scope", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: {
        iss: ISSUER,
        sub: "client-proxy",
        scope: `${PROXY_RESOLVE_HOST_SCOPE} other:scope`,
      },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects when iss has a different subdomain", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: {
        iss: "https://evil.example.test/",
        scope: PROXY_RESOLVE_HOST_SCOPE,
      },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({ ok: false, reason: "issuer mismatch" });
  });

  it("rejects when iss is on a different path under the same host", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: {
        iss: "https://issuer.example.test/tenant-x/",
        scope: PROXY_RESOLVE_HOST_SCOPE,
      },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({ ok: false, reason: "issuer mismatch" });
  });

  it("rejects when the required scope is missing", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: {
        iss: ISSUER,
        scope: "other:scope",
      },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "missing required scope",
    });
  });

  it("rejects an unsupported alg (HS256)", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
      headerAlg: "HS256",
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({ ok: false, reason: "unsupported alg" });
  });

  it("rejects when the header has no kid", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
      kid: null,
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({ ok: false, reason: "missing kid" });
  });

  it("rejects an unknown kid", async () => {
    const keyset = await createTestKeyset();
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
      kid: "not-a-real-kid",
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({ ok: false, reason: "unknown kid" });
  });

  it("rejects when the jwk's published alg disagrees with the header alg", async () => {
    const keyset = await createTestKeyset({ alg: "RS256" });
    // Token is signed RS256 (real), but the JWKS publishes alg=RS384 for the
    // same kid. The verifier must not let a key be reused under a different
    // alg even if the kid matches.
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
      jwkAlg: "RS384",
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: keyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "alg mismatch between jwk and token header",
    });
  });

  it("rejects a token signed by a different key (signature failure)", async () => {
    const goodKeyset = await createTestKeyset({ kid: "kid-good" });
    const evilKeyset = await createTestKeyset({ kid: "kid-good" });
    // Evil signer mints a token claiming the good kid; the good JWKS has a
    // different public key for that kid, so the signature won't verify.
    const token = await evilKeyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: goodKeyset.jwksUrl,
      jwksFetch: goodKeyset.jwksFetch,
      expectedIssuer: ISSUER,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "signature verification failed",
    });
  });

  it("uses jwksFetch override when provided", async () => {
    const keyset = await createTestKeyset();
    let calls = 0;
    const fetcher = async (url: string): Promise<Response> => {
      calls += 1;
      return keyset.jwksFetch(url);
    };
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksUrl: keyset.jwksUrl,
      jwksFetch: fetcher,
      expectedIssuer: ISSUER,
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});
