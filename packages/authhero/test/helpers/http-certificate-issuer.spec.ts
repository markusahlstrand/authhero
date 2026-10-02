import { describe, it, expect, vi } from "vitest";
import * as x509 from "@peculiar/x509";
import { chainLength, createTestSigningCa, sanUris } from "./signing-ca";
import { createX509Certificate } from "../../src/utils/encryption";
import {
  createCertificateIssuerApp,
  createHttpCertificateIssuer,
} from "../../src/helpers/http-certificate-issuer";

const BASE_URL = "https://ca.example.com/v1";

// The caller names its tenant in a header; the service only certifies that
// tenant's URN. A real deployment would verify a credential instead.
async function setup(options: { maxValidityDays?: number } = {}) {
  const ca = await createTestSigningCa();
  const app = createCertificateIssuerApp({
    issuer: ca.issuer,
    authorize: ({ request, certificateRequest }) =>
      certificateRequest.uri ===
      `urn:authhero:tenant:${request.headers.get("x-tenant")}`,
    maxValidityDays: options.maxValidityDays,
  });

  const requests: string[] = [];
  const fetchViaApp: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return app.fetch(
      new Request(`http://ca${url.pathname.replace("/v1", "")}`, init),
    );
  };

  const issuerFor = (tenant: string) =>
    createHttpCertificateIssuer({
      url: `${BASE_URL}/`,
      headers: async () => ({ "x-tenant": tenant }),
      fetch: fetchViaApp,
    });

  return { ca, app, requests, issuerFor };
}

describe("HTTP certificate issuer", () => {
  it("issues a leaf through the remote service", async () => {
    const { ca, issuerFor } = await setup();

    const key = await createX509Certificate({
      name: "CN=acme",
      validityDays: 30,
      certificateAuthority: {
        issuer: issuerFor("acme"),
        uri: "urn:authhero:tenant:acme",
      },
    });
    const leaf = new x509.X509Certificate(key.cert);

    expect(sanUris(leaf)).toEqual(["urn:authhero:tenant:acme"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);
  });

  it("refuses a certificate naming another tenant", async () => {
    const { issuerFor } = await setup();

    await expect(
      createX509Certificate({
        name: "CN=acme",
        validityDays: 30,
        certificateAuthority: {
          issuer: issuerFor("acme"),
          uri: "urn:authhero:control-plane",
        },
      }),
    ).rejects.toThrow(/403/);
  });

  it("refuses a lifetime above maxValidityDays", async () => {
    const { issuerFor } = await setup({ maxValidityDays: 7 });

    await expect(
      createX509Certificate({
        name: "CN=acme",
        validityDays: 30,
        certificateAuthority: {
          issuer: issuerFor("acme"),
          uri: "urn:authhero:tenant:acme",
        },
      }),
    ).rejects.toThrow(/400/);
  });

  it("rejects a future validity window even within the lifetime cap", async () => {
    const issueCertificate = vi.fn();
    const app = createCertificateIssuerApp({
      issuer: { issueCertificate, getIssuerCertificates: async () => [] },
      authorize: () => true,
      maxValidityDays: 7,
    });
    const notBefore = new Date(Date.now() + 3650 * 86_400_000);
    const notAfter = new Date(notBefore.getTime() + 7 * 86_400_000);
    const response = await app.request("/certificates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicKey: "unused",
        subject: "CN=acme",
        uri: "urn:authhero:tenant:acme",
        notBefore: notBefore.toISOString(),
        notAfter: notAfter.toISOString(),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "requested validity is not allowed",
    });
    expect(issueCertificate).not.toHaveBeenCalled();
  });

  it("rejects malformed requests", async () => {
    const { app } = await setup();

    const response = await app.fetch(
      new Request("http://ca/certificates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: "x" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("caches issuer certificates, but not failures", async () => {
    const { ca, issuerFor, requests } = await setup();
    const issuer = issuerFor("acme");

    const first = await issuer.getIssuerCertificates();
    await issuer.getIssuerCertificates();

    expect(first).toHaveLength(1);
    expect(new x509.X509Certificate(first[0]!).equal(ca.intermediate)).toBe(
      true,
    );
    expect(
      requests.filter((r) => r === "GET /v1/issuer-certificates"),
    ).toHaveLength(1);

    let attempts = 0;
    const failingOnce = createHttpCertificateIssuer({
      url: BASE_URL,
      fetch: async () => {
        attempts++;
        return attempts === 1
          ? new Response("down", { status: 503 })
          : Response.json({ certificates: ["pem"] });
      },
    });
    await expect(failingOnce.getIssuerCertificates()).rejects.toThrow(/503/);
    await expect(failingOnce.getIssuerCertificates()).resolves.toEqual(["pem"]);
  });
});
