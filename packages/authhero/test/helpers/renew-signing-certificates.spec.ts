import { describe, it, expect } from "vitest";
import * as x509 from "@peculiar/x509";
import { SigningKey } from "@authhero/adapter-interfaces";
import { getTestServer } from "./test-server";
import { chainLength, createTestSigningCa, sanUris } from "./signing-ca";
import { createX509Certificate } from "../../src/utils/encryption";
import {
  SigningCertificateRenewalError,
  renewSigningCertificates,
} from "../../src/helpers/renew-signing-certificates";
import { CertificateIssuer } from "../../src/helpers/signing-certificate-authority";

async function setup() {
  const { env } = await getTestServer();
  const ca = await createTestSigningCa();

  const addKey = async (
    options: {
      validityDays?: number;
      ca?: boolean;
      overrides?: Partial<SigningKey>;
    } = {},
  ) => {
    const generated = await createX509Certificate({
      name: "CN=tenantId",
      validityDays: options.validityDays ?? 30,
      ...(options.ca === false
        ? {}
        : {
            certificateAuthority: {
              issuer: ca.issuer,
              uri: "urn:authhero:tenant:tenantId",
            },
          }),
    });
    const key: SigningKey = {
      ...generated,
      type: "jwt_signing",
      tenant_id: "tenantId",
      ...options.overrides,
    };
    await env.data.keys.create(key);
    return key;
  };

  const stored = async (kid: string) => {
    const { signingKeys } = await env.data.keys.list({
      q: "type:jwt_signing",
      per_page: 1000,
    });
    const key = signingKeys.find((k) => k.kid === kid);
    if (!key) throw new Error(`key ${kid} not found`);
    return key;
  };

  return { env, ca, addKey, stored };
}

describe("renewSigningCertificates", () => {
  it("renews CA-issued certificates that are due, keeping the kid", async () => {
    const { env, ca, addKey, stored } = await setup();
    const due = await addKey({ validityDays: 2 });
    const fresh = await addKey({ validityDays: 30 });

    const result = await renewSigningCertificates({
      dataAdapter: env.data,
      certificateAuthority: { issuer: ca.issuer },
    });

    expect(result.renewed).toEqual([due.kid]);
    expect(result.notDue).toBe(1);

    const renewed = await stored(due.kid);
    expect(renewed.cert).not.toBe(due.cert);
    const leaf = new x509.X509Certificate(renewed.cert);
    expect(sanUris(leaf)).toEqual(["urn:authhero:tenant:tenantId"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);
    const lifetimeDays =
      (leaf.notAfter.getTime() - leaf.notBefore.getTime()) / 86_400_000;
    expect(Math.round(lifetimeDays)).toBe(30);

    expect((await stored(fresh.kid)).cert).toBe(fresh.cert);
  });

  it("honors renewBeforeDays", async () => {
    const { env, ca, addKey } = await setup();
    const key = await addKey({ validityDays: 30 });

    const result = await renewSigningCertificates({
      dataAdapter: env.data,
      certificateAuthority: { issuer: ca.issuer },
      renewBeforeDays: 31,
    });

    expect(result.renewed).toEqual([key.kid]);
  });

  it("leaves self-signed, public-only and revoked keys alone", async () => {
    const { env, ca, addKey, stored } = await setup();
    const selfSigned = await addKey({ validityDays: 1, ca: false });
    const publicOnly = await addKey({
      validityDays: 1,
      overrides: { pkcs7: undefined },
    });
    const revoked = await addKey({
      validityDays: 1,
      overrides: { revoked_at: new Date(Date.now() - 1000).toISOString() },
    });

    const result = await renewSigningCertificates({
      dataAdapter: env.data,
      certificateAuthority: { issuer: ca.issuer },
    });

    expect(result.renewed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect((await stored(selfSigned.kid)).cert).toBe(selfSigned.cert);
    expect((await stored(publicOnly.kid)).cert).toBe(publicOnly.cert);
    const { signingKeys } = await env.data.keys.list({
      q: "type:jwt_signing",
      per_page: 1000,
    });
    expect(
      signingKeys.find((k) => k.kid === revoked.kid)?.cert ?? revoked.cert,
    ).toBe(revoked.cert);
  });

  it("renews keys still in their post-rotation grace period", async () => {
    const { env, ca, addKey } = await setup();
    const outgoing = await addKey({
      validityDays: 1,
      overrides: {
        revoked_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    const result = await renewSigningCertificates({
      dataAdapter: env.data,
      certificateAuthority: { issuer: ca.issuer },
    });

    expect(result.renewed).toEqual([outgoing.kid]);
  });

  it("tries every key and reports failures at the end", async () => {
    const { env, ca, addKey, stored } = await setup();
    const first = await addKey({ validityDays: 1 });
    const second = await addKey({ validityDays: 1 });

    let calls = 0;
    const flaky: CertificateIssuer = {
      issueCertificate: async (request) => {
        calls++;
        if (calls === 1) throw new Error("CA unavailable");
        return ca.issuer.issueCertificate(request);
      },
      getIssuerCertificates: ca.issuer.getIssuerCertificates,
    };

    const error = await renewSigningCertificates({
      dataAdapter: env.data,
      certificateAuthority: { issuer: flaky },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SigningCertificateRenewalError);
    const { result } = error as SigningCertificateRenewalError;
    expect(result.failed).toHaveLength(1);
    expect(result.renewed).toHaveLength(1);

    const failedKid = result.failed[0]!.kid;
    const renewedKid = result.renewed[0]!;
    expect([failedKid, renewedKid].sort()).toEqual(
      [first.kid, second.kid].sort(),
    );
    const failedKey = failedKid === first.kid ? first : second;
    expect((await stored(failedKid)).cert).toBe(failedKey.cert);
  });
});
