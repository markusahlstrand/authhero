import { describe, it, expect, vi } from "vitest";
import { verifyControlPlaneToken } from "./verify";

/** Craft an (unsigned) compact JWT the verifier can `decode()` for its header/iss. */
function makeToken(header: object, payload: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64(header)}.${b64(payload)}.sig`;
}

const CP_ISSUER = "https://cp.example.com/";
const TENANT_ISSUER = "https://acme.cp.example.com/";

describe("verifyControlPlaneToken issuer allow-list", () => {
  const header = { alg: "RS256", kid: "k1" };
  const payload = {
    iss: TENANT_ISSUER,
    scope: "controlplane:tenant_members",
    tenant_id: "acme",
  };

  it("rejects a WFP tenant-subdomain issuer with issuer mismatch (before any fetch)", async () => {
    const jwksFetch = vi.fn(async () => new Response("{}"));
    const result = await verifyControlPlaneToken({
      token: makeToken(header, payload),
      jwksFetch,
      expectedIssuers: [CP_ISSUER],
      requiredScope: "controlplane:tenant_members",
    });
    expect(result).toEqual({ ok: false, reason: "issuer mismatch" });
    // The SSRF guard: no key fetch happens for a disallowed issuer.
    expect(jwksFetch).not.toHaveBeenCalled();
  });

  it("passes the issuer gate when isTrustedIssuer accepts the subdomain, then fetches its JWKS", async () => {
    // Return an empty key set so verification fails AFTER the issuer gate — we
    // only care that the gate let it through and the fetch targeted the
    // tenant-subdomain JWKS.
    const jwksFetch = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const isTrustedIssuer = vi.fn(
      (iss: string) => iss === TENANT_ISSUER,
    );

    const result = await verifyControlPlaneToken({
      token: makeToken(header, payload),
      jwksFetch,
      expectedIssuers: [CP_ISSUER],
      requiredScope: "controlplane:tenant_members",
      isTrustedIssuer,
    });

    expect(isTrustedIssuer).toHaveBeenCalledWith(TENANT_ISSUER);
    expect(jwksFetch).toHaveBeenCalledWith(
      "https://acme.cp.example.com/.well-known/jwks.json",
    );
    // Gate passed; failure is now "unknown kid" (empty key set), not issuer.
    expect(result).toEqual({ ok: false, reason: "unknown kid" });
  });

  it("does not consult isTrustedIssuer for an issuer already in expectedIssuers", async () => {
    const jwksFetch = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const isTrustedIssuer = vi.fn(() => false);
    await verifyControlPlaneToken({
      token: makeToken(header, { ...payload, iss: CP_ISSUER }),
      jwksFetch,
      expectedIssuers: [CP_ISSUER],
      requiredScope: "controlplane:tenant_members",
      isTrustedIssuer,
    });
    // expectedIssuers matched first; the predicate short-circuits.
    expect(isTrustedIssuer).not.toHaveBeenCalled();
  });

  it("rejects (does not throw) when isTrustedIssuer accepts a malformed issuer URL", async () => {
    const jwksFetch = vi.fn(async () => new Response("{}"));
    const result = await verifyControlPlaneToken({
      token: makeToken(header, { ...payload, iss: "not a url" }),
      jwksFetch,
      expectedIssuers: [CP_ISSUER],
      requiredScope: "controlplane:tenant_members",
      // A permissive predicate lets an unparseable issuer past the allow-list;
      // deriving its JWKS URL must fail closed, not throw.
      isTrustedIssuer: () => true,
    });
    expect(result).toEqual({ ok: false, reason: "malformed issuer url" });
    expect(jwksFetch).not.toHaveBeenCalled();
  });

  it("still rejects an untrusted issuer when the predicate returns false", async () => {
    const jwksFetch = vi.fn(async () => new Response("{}"));
    const result = await verifyControlPlaneToken({
      token: makeToken(header, { ...payload, iss: "https://evil.example.com/" }),
      jwksFetch,
      expectedIssuers: [CP_ISSUER],
      requiredScope: "controlplane:tenant_members",
      isTrustedIssuer: (iss) => iss === TENANT_ISSUER,
    });
    expect(result).toEqual({ ok: false, reason: "issuer mismatch" });
    expect(jwksFetch).not.toHaveBeenCalled();
  });
});
