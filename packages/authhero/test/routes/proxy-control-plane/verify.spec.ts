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
  it("accepts a well-formed token whose iss matches the only expected issuer", async () => {
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a token whose iss matches a tenant subdomain in expectedIssuers (per-host JWKS)", async () => {
    // Each host publishes its own JWKS. Build a keyset rooted at the
    // subdomain so the derived JWKS URL (`<iss>/.well-known/jwks.json`)
    // routes to that keyset's signer.
    const tenantIssuer = "https://sesamy.token.sesamy.com/";
    const tenantKeyset = await createTestKeyset({
      jwksUrl: "https://sesamy.token.sesamy.com/.well-known/jwks.json",
    });
    const token = await tenantKeyset.sign({
      payload: { iss: tenantIssuer, scope: PROXY_RESOLVE_HOST_SCOPE },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksFetch: tenantKeyset.jwksFetch,
      expectedIssuers: ["https://token.sesamy.com/", tenantIssuer],
    });
    expect(result).toEqual({ ok: true });
  });

  it("derives the JWKS URL from iss — a token signed for issuer A is rejected when JWKS for B has no matching kid", async () => {
    // Two hosts, two keysets — issuing host's kid is NOT in the other
    // host's JWKS. The verifier must fetch from the iss-derived URL, so
    // forging an iss-host claim cannot reuse a different host's keys.
    const hostA = "https://a.example.test/";
    const hostB = "https://b.example.test/";
    const ksA = await createTestKeyset({
      kid: "kid-a",
      jwksUrl: "https://a.example.test/.well-known/jwks.json",
    });
    const ksB = await createTestKeyset({
      kid: "kid-b",
      jwksUrl: "https://b.example.test/.well-known/jwks.json",
    });
    // Compose a fetcher that knows both hosts.
    const fetcher = async (url: string): Promise<Response> => {
      if (url.startsWith("https://a.example.test/")) return ksA.jwksFetch(url);
      if (url.startsWith("https://b.example.test/")) return ksB.jwksFetch(url);
      return new Response("not found", { status: 404 });
    };
    // Token claims iss = hostB but is signed by ksA (kid-a). The verifier
    // fetches host B's JWKS, which only has kid-b → "unknown kid".
    const token = await ksA.sign({
      payload: { iss: hostB, scope: PROXY_RESOLVE_HOST_SCOPE },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksFetch: fetcher,
      expectedIssuers: [hostA, hostB],
    });
    expect(result).toMatchObject({ ok: false, reason: "unknown kid" });
  });

  it("rejects when iss is not in expectedIssuers (before any JWKS fetch)", async () => {
    const keyset = await createTestKeyset();
    let fetchCalls = 0;
    const fetcher = async (url: string): Promise<Response> => {
      fetchCalls += 1;
      return keyset.jwksFetch(url);
    };
    const token = await keyset.sign({
      payload: {
        iss: "https://evil.example.test/",
        scope: PROXY_RESOLVE_HOST_SCOPE,
      },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksFetch: fetcher,
      expectedIssuers: [ISSUER],
    });
    expect(result).toMatchObject({ ok: false, reason: "issuer mismatch" });
    // Critical: an unallowed iss must NOT trigger a JWKS fetch — that's
    // how host allow-listing prevents SSRF / attacker-controlled JWKS.
    expect(fetchCalls).toBe(0);
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
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
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
    });
    expect(result).toMatchObject({ ok: false, reason: "unknown kid" });
  });

  it("rejects when the jwk's published alg disagrees with the header alg", async () => {
    const keyset = await createTestKeyset({ alg: "RS256" });
    const token = await keyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
      jwkAlg: "RS384",
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksFetch: keyset.jwksFetch,
      expectedIssuers: [ISSUER],
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "alg mismatch between jwk and token header",
    });
  });

  it("rejects a token signed by a different key (signature failure)", async () => {
    const goodKeyset = await createTestKeyset({ kid: "kid-good" });
    const evilKeyset = await createTestKeyset({ kid: "kid-good" });
    const token = await evilKeyset.sign({
      payload: { iss: ISSUER, scope: PROXY_RESOLVE_HOST_SCOPE },
    });
    const result = await verifyControlPlaneToken({
      token,
      jwksFetch: goodKeyset.jwksFetch,
      expectedIssuers: [ISSUER],
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
      jwksFetch: fetcher,
      expectedIssuers: [ISSUER],
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});
