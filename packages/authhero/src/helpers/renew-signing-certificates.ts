import * as x509 from "@peculiar/x509";
import { DataAdapters, SigningKey } from "@authhero/adapter-interfaces";
import { renewX509Certificate } from "../utils/encryption";
import {
  DEFAULT_CA_CERT_VALIDITY_DAYS,
  SigningCertificateAuthority,
  certificateAuthorityIssuance,
  isCaIssued,
} from "./signing-certificate-authority";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

export interface RenewSigningCertificatesConfig {
  /** Same `DataAdapters` passed to `init()`. */
  dataAdapter: Pick<DataAdapters, "keys">;
  /** Same value passed to `init({ signingCertificateAuthority })`. */
  certificateAuthority: SigningCertificateAuthority;
  /**
   * Renew certificates that expire within this many days.
   *
   * @default a third of the CA's `validityDays` (10 days for the 30-day
   * default), and at least one day
   */
  renewBeforeDays?: number;
  /** Clock override for tests. */
  now?: () => Date;
}

export interface RenewSigningCertificatesResult {
  /** Keys whose certificate was re-issued. The `kid` is unchanged. */
  renewed: string[];
  /** CA-issued keys that are not due yet. */
  notDue: number;
  failed: { kid: string; error: unknown }[];
}

/** Thrown after every key has been tried, when at least one renewal failed. */
export class SigningCertificateRenewalError extends Error {
  constructor(public result: RenewSigningCertificatesResult) {
    super(
      `Failed to renew ${result.failed.length} signing certificate(s): ${result.failed
        .map(({ kid }) => kid)
        .join(", ")}`,
    );
    this.name = "SigningCertificateRenewalError";
  }
}

/**
 * Re-issues CA-issued `jwt_signing` certificates that are close to expiry.
 *
 * Renewal keeps the key pair, so the `kid` and every token already signed
 * stay valid; only the certificate — and therefore the `x5c` a resource
 * server validates — moves forward. Call it from a scheduled handler at least
 * daily.
 *
 * Only certificates the CA issued are touched. Self-signed keys created
 * before the CA was configured keep their certificate until they are rotated
 * out, and public-only rows (a WFP tenant's copy of the control plane's
 * verify keys) are skipped because there is no private key to certify.
 *
 * Every key is tried even if an earlier one fails. If any failed, a
 * `SigningCertificateRenewalError` carrying the result is thrown at the end.
 *
 * @example
 * ```ts
 * export default {
 *   async scheduled(_event, env) {
 *     await renewSigningCertificates({
 *       dataAdapter,
 *       certificateAuthority: signingCertificateAuthority,
 *     });
 *   },
 * };
 * ```
 */
export async function renewSigningCertificates(
  config: RenewSigningCertificatesConfig,
): Promise<RenewSigningCertificatesResult> {
  const { dataAdapter, certificateAuthority } = config;
  const now = config.now?.() ?? new Date();
  const validityDays =
    certificateAuthority.validityDays ?? DEFAULT_CA_CERT_VALIDITY_DAYS;
  const renewBeforeDays =
    config.renewBeforeDays ?? Math.max(1, Math.floor(validityDays / 3));
  const renewBefore = now.getTime() + renewBeforeDays * MS_PER_DAY;

  const result: RenewSigningCertificatesResult = {
    renewed: [],
    notDue: 0,
    failed: [],
  };

  for (const key of await listRenewableKeys(dataAdapter.keys, now)) {
    // Parsing is inside the try: one unreadable row is reported as a failure
    // rather than stopping every other key from being renewed.
    try {
      const cert = new x509.X509Certificate(key.cert);
      if (!isCaIssued(cert)) continue;
      if (cert.notAfter.getTime() > renewBefore) {
        result.notDue++;
        continue;
      }

      const renewed = await renewX509Certificate({
        cert: key.cert,
        pkcs7: key.pkcs7!,
        validityDays,
        certificateAuthority: certificateAuthorityIssuance(
          certificateAuthority,
          key,
        ),
      });
      await dataAdapter.keys.update(key.kid, {
        cert: renewed.cert,
        thumbprint: renewed.thumbprint,
      });
      result.renewed.push(key.kid);
    } catch (error) {
      result.failed.push({ kid: key.kid, error });
    }
  }

  if (result.failed.length > 0) {
    throw new SigningCertificateRenewalError(result);
  }
  return result;
}

/**
 * Every non-revoked `jwt_signing` key that holds a private key, across all
 * scopes. Keys inside their post-rotation grace period are included: they
 * are still published, so their chain must stay valid until they drop out.
 */
async function listRenewableKeys(
  keys: DataAdapters["keys"],
  now: Date,
): Promise<SigningKey[]> {
  const out: SigningKey[] = [];
  for (let page = 0; ; page++) {
    const { signingKeys } = await keys.list({
      q: "type:jwt_signing",
      page,
      per_page: PAGE_SIZE,
    });
    for (const key of signingKeys) {
      if (key.type !== "jwt_signing") continue;
      if (key.revoked_at && new Date(key.revoked_at) <= now) continue;
      if (!key.pkcs7) continue;
      out.push(key);
    }
    if (signingKeys.length < PAGE_SIZE) break;
  }
  return out;
}
