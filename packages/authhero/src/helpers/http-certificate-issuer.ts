import { Hono } from "hono";
import { z } from "@hono/zod-openapi";
import {
  CertificateIssuer,
  SigningCertificateRequest,
} from "./signing-certificate-authority";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const certificateRequestBodySchema = z.object({
  publicKey: z.string().min(1),
  subject: z.string().min(1),
  uri: z.string().min(1),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
});

const certificateResponseSchema = z.object({ certificate: z.string() });
const issuerCertificatesResponseSchema = z.object({
  certificates: z.array(z.string()),
});

export interface HttpCertificateIssuerOptions {
  /** Base URL of a service mounted with `createCertificateIssuerApp`. */
  url: string;
  /**
   * Headers sent with every certificate request — typically the credential
   * that identifies this caller to the CA service.
   */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /**
   * How long to cache the issuer certificates used to build `x5c`.
   *
   * @default 300
   */
  issuerCertificatesTtlSeconds?: number;
  /** Override for tests or a service binding's `fetch`. */
  fetch?: typeof fetch;
}

/**
 * A `CertificateIssuer` that asks a remote CA service to certify keys, so the
 * CA private key never has to live in the auth worker. Pair it with
 * `createCertificateIssuerApp` on the service side.
 */
export function createHttpCertificateIssuer(
  options: HttpCertificateIssuerOptions,
): CertificateIssuer {
  const baseUrl = options.url.replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const ttlMs = (options.issuerCertificatesTtlSeconds ?? 300) * 1000;
  let cached: { expiresAt: number; value: Promise<string[]> } | undefined;

  async function headers(): Promise<Record<string, string>> {
    const extra =
      typeof options.headers === "function"
        ? await options.headers()
        : options.headers;
    return { ...extra, "content-type": "application/json" };
  }

  async function readJson(response: Response, what: string): Promise<unknown> {
    if (!response.ok) {
      throw new Error(
        `Certificate issuer rejected the ${what} request: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  return {
    async issueCertificate(request) {
      const response = await doFetch(`${baseUrl}/certificates`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          ...request,
          notBefore: request.notBefore.toISOString(),
          notAfter: request.notAfter.toISOString(),
        }),
      });
      const body = certificateResponseSchema.parse(
        await readJson(response, "certificate"),
      );
      return body.certificate;
    },

    getIssuerCertificates() {
      const now = Date.now();
      if (!cached || cached.expiresAt <= now) {
        const value = (async () => {
          const response = await doFetch(`${baseUrl}/issuer-certificates`, {
            headers: await headers(),
          });
          return issuerCertificatesResponseSchema.parse(
            await readJson(response, "issuer certificates"),
          ).certificates;
        })();
        cached = { expiresAt: now + ttlMs, value };
        // Don't cache a failure for the whole TTL: the next caller retries.
        value.catch(() => {
          if (cached?.value === value) cached = undefined;
        });
      }
      return cached.value;
    },
  };
}

export interface CertificateIssuerAppOptions {
  /** The issuer that actually signs, typically `createLocalCertificateIssuer`. */
  issuer: CertificateIssuer;
  /**
   * Decide whether the caller may have this certificate. This is the only
   * thing stopping one tenant from obtaining a certificate that names another
   * tenant, or the control plane, so check the caller's identity against
   * `certificateRequest.uri`.
   */
  authorize: (params: {
    request: Request;
    certificateRequest: SigningCertificateRequest;
  }) => boolean | Promise<boolean>;
  /**
   * The longest lifetime a caller may request. Keeps a compromised caller
   * from minting a certificate that outlives its access.
   *
   * @default 90
   */
  maxValidityDays?: number;
}

/**
 * Serves a `CertificateIssuer` over HTTP for `createHttpCertificateIssuer`.
 *
 * - `POST /certificates` issues a leaf after `authorize` approves it.
 * - `GET /issuer-certificates` returns the intermediates. They are published
 *   in every JWKS `x5c` anyway, so this route is not authorized.
 */
export function createCertificateIssuerApp(
  options: CertificateIssuerAppOptions,
): Hono {
  const maxValidityMs = (options.maxValidityDays ?? 90) * MS_PER_DAY;

  return new Hono()
    .post("/certificates", async (c) => {
      const parsed = certificateRequestBodySchema.safeParse(
        await c.req.json().catch(() => undefined),
      );
      if (!parsed.success) {
        return c.json({ error: "invalid certificate request" }, 400);
      }
      const certificateRequest: SigningCertificateRequest = {
        ...parsed.data,
        notBefore: new Date(parsed.data.notBefore),
        notAfter: new Date(parsed.data.notAfter),
      };
      const lifetimeMs =
        certificateRequest.notAfter.getTime() -
        certificateRequest.notBefore.getTime();
      if (lifetimeMs <= 0 || lifetimeMs > maxValidityMs) {
        return c.json({ error: "requested validity is not allowed" }, 400);
      }

      const allowed = await options.authorize({
        request: c.req.raw,
        certificateRequest,
      });
      if (!allowed) {
        return c.json({ error: "forbidden" }, 403);
      }

      const certificate =
        await options.issuer.issueCertificate(certificateRequest);
      return c.json({ certificate });
    })
    .get("/issuer-certificates", async (c) => {
      const certificates = await options.issuer.getIssuerCertificates();
      return c.json({ certificates });
    });
}
