import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { deflateRawSync } from "node:zlib";
import { X509Certificate } from "@peculiar/x509";
import { getTestServer } from "../../helpers/test-server";
import { createX509Certificate } from "../../../src/utils/encryption";

function encodeSamlRequest(xml: string): string {
  // SAML HTTP Redirect binding compresses the AuthnRequest with raw-deflate
  // before base64-encoding. parseSamlRequestQuery uses DecompressionStream
  // ("deflate-raw"), which expects the same format.
  return deflateRawSync(Buffer.from(xml, "utf8")).toString("base64");
}

function buildSamlRequest(opts: {
  id?: string;
  issuer: string;
  destination?: string;
  assertionConsumerServiceURL?: string;
}): string {
  const id = opts.id ?? "_abc123";
  const destination =
    opts.destination ?? "http://localhost:3000/samlp/clientId";
  const acsAttr = opts.assertionConsumerServiceURL
    ? ` AssertionConsumerServiceURL="${opts.assertionConsumerServiceURL}"`
    : "";
  const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="2026-01-01T00:00:00Z" Destination="${destination}"${acsAttr}><saml:Issuer>${opts.issuer}</saml:Issuer></samlp:AuthnRequest>`;
  return encodeSamlRequest(xml);
}

interface ErrorBody {
  error?: string;
  error_description?: string;
  message?: string;
}

describe("/samlp/{client_id} — SP-initiated SAML AuthnRequest", () => {
  it("rejects an AssertionConsumerServiceURL that isn't in the client's callbacks", async () => {
    const { samlApp, env } = await getTestServer();
    const client = testClient(samlApp, env);

    const samlRequest = buildSamlRequest({
      issuer: "https://attacker.example/sp",
      assertionConsumerServiceURL: "https://attacker.example/acs",
    });

    const response = await client[":client_id"].$get({
      param: { client_id: "clientId" },
      query: { SAMLRequest: samlRequest },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error_description).toMatch(
      /AssertionConsumerServiceURL is not in the client's allowed callbacks/,
    );
  });

  it("rejects a SAMLRequest with no AssertionConsumerServiceURL", async () => {
    const { samlApp, env } = await getTestServer();
    const client = testClient(samlApp, env);

    const samlRequest = buildSamlRequest({
      id: "_no_acs",
      issuer: "https://sp.example/sp",
      // no assertionConsumerServiceURL
    });

    const response = await client[":client_id"].$get({
      param: { client_id: "clientId" },
      query: { SAMLRequest: samlRequest },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error_description).toMatch(
      /AssertionConsumerServiceURL is required/,
    );
  });

  it("accepts an AssertionConsumerServiceURL that matches a registered callback (302 → login)", async () => {
    const { samlApp, env } = await getTestServer();
    const client = testClient(samlApp, env);

    // Test fixture's `clientId` has callbacks including https://example.com/callback
    const samlRequest = buildSamlRequest({
      issuer: "https://sp.example/sp",
      assertionConsumerServiceURL: "https://example.com/callback",
    });

    const response = await client[":client_id"].$get({
      param: { client_id: "clientId" },
      query: { SAMLRequest: samlRequest },
    });

    // 302 to the universal login identifier screen.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^\/u\/login\/identifier\?state=/,
    );
  });

  it("rejects an unsigned request when the client has require_signed_requests enabled", async () => {
    const { samlApp, env } = await getTestServer();

    // Add the addon flag to the fixture client
    await env.data.clients.update("tenantId", "clientId", {
      addons: {
        samlp: { require_signed_requests: true },
      },
    });

    const client = testClient(samlApp, env);

    const samlRequest = buildSamlRequest({
      issuer: "https://sp.example/sp",
      assertionConsumerServiceURL: "https://example.com/callback",
    });

    const response = await client[":client_id"].$get({
      param: { client_id: "clientId" },
      query: { SAMLRequest: samlRequest },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error_description).toMatch(/signature verification/);
  });

  it("rejects a request with a Signature param when require_signed_requests is enabled (verification not implemented)", async () => {
    const { samlApp, env } = await getTestServer();

    await env.data.clients.update("tenantId", "clientId", {
      addons: {
        samlp: { require_signed_requests: true },
      },
    });

    const client = testClient(samlApp, env);

    const samlRequest = buildSamlRequest({
      issuer: "https://sp.example/sp",
      assertionConsumerServiceURL: "https://example.com/callback",
    });

    // Attacker supplies a Signature value but no verification is performed —
    // server must still fail closed rather than treat mere presence as proof.
    const response = await client[":client_id"].$get({
      param: { client_id: "clientId" },
      query: {
        SAMLRequest: samlRequest,
        SigAlg: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
        Signature: "not-a-real-signature",
      },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error_description).toMatch(/signature verification/);
  });
});

describe("/samlp/metadata/{client_id}", () => {
  it("publishes a staged certificate alongside the one currently signing", async () => {
    const { samlApp, env } = await getTestServer();
    const client = testClient(samlApp, env);

    const live = await createX509Certificate({ name: "CN=live" });
    await env.data.keys.create({
      ...live,
      type: "saml_encryption",
      current_since: new Date(Date.now() - 60_000).toISOString(),
    });

    // Staged: published now so a service provider can be given it, but not
    // signing anything until its activation date.
    const staged = await createX509Certificate({ name: "CN=staged" });
    await env.data.keys.create({
      ...staged,
      type: "saml_encryption",
      current_since: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    const response = await client.metadata[":client_id"].$get({
      param: { client_id: "clientId" },
    });
    expect(response.status).toBe(200);

    const metadata = await response.text();
    for (const key of [live, staged]) {
      expect(metadata).toContain(
        new X509Certificate(key.cert).toString("base64"),
      );
    }
  });

  it("omits a revoked certificate", async () => {
    const { samlApp, env } = await getTestServer();
    const client = testClient(samlApp, env);

    const live = await createX509Certificate({ name: "CN=live" });
    await env.data.keys.create({ ...live, type: "saml_encryption" });

    const retired = await createX509Certificate({ name: "CN=retired" });
    await env.data.keys.create({
      ...retired,
      type: "saml_encryption",
      revoked_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const response = await client.metadata[":client_id"].$get({
      param: { client_id: "clientId" },
    });
    const metadata = await response.text();

    expect(metadata).toContain(
      new X509Certificate(live.cert).toString("base64"),
    );
    expect(metadata).not.toContain(
      new X509Certificate(retired.cert).toString("base64"),
    );
  });
});
