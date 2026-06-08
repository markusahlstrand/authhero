import {
  CustomDomain,
  CustomDomainCertificateUpload,
  CustomDomainInsert,
  CustomDomainsAdapter,
  VerificationMethods,
  verificationMethodsSchema,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import wretch from "wretch";
import { retry, dedupe } from "wretch/middlewares";
import { CloudflareConfig } from "../types/CloudflareConfig";
import {
  customDomainResponseSchema,
  CustomDomainResult,
} from "../types/CustomDomain";

function getClient(config: CloudflareConfig) {
  return wretch(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}`)
    .headers({
      "X-Auth-Email": config.authEmail,
      "X-Auth-Key": config.authKey,
      "Content-Type": "application/json",
    })
    .middlewares([retry(), dedupe()]);
}

/**
 * Extract ssl.* prefixed keys from domain_metadata and return them as
 * a partial SSL config object, plus the remaining metadata.
 */
function extractSslFromMetadata(metadata?: Record<string, string>): {
  sslOverrides: Record<string, string>;
  rest: Record<string, string>;
} {
  const sslOverrides: Record<string, string> = {};
  const rest: Record<string, string> = {};

  if (!metadata) return { sslOverrides, rest };

  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("ssl.")) {
      sslOverrides[key.slice(4)] = value;
    } else {
      rest[key] = value;
    }
  }

  return { sslOverrides, rest };
}

function mapCustomDomainResponse(
  result: CustomDomainResult & {
    primary: boolean;
    type?: CustomDomain["type"];
    domain_metadata?: Record<string, string>;
  },
): CustomDomain {
  const methods: VerificationMethods[] = [];

  if (result.ssl.validation_records) {
    for (const record of result.ssl.validation_records) {
      if (record.txt_name && record.txt_value) {
        methods.push({
          name: "txt",
          record: record.txt_value,
          domain: record.txt_name,
        });
      }
    }
  }

  if (result.ownership_verification) {
    methods.push({
      name: "txt",
      record: result.ownership_verification.value,
      domain: result.ownership_verification.name,
    });
  }

  if (
    result.ownership_verification_http?.http_body &&
    result.ownership_verification_http?.http_url
  ) {
    methods.push({
      name: "http",
      http_body: result.ownership_verification_http.http_body,
      http_url: result.ownership_verification_http.http_url,
    });
  }

  if (result.ssl.validation_records) {
    for (const record of result.ssl.validation_records) {
      if (record.http_body && record.http_url) {
        methods.push({
          name: "http",
          http_body: record.http_body,
          http_url: record.http_url,
        });
      }
    }
  }

  // Build domain_metadata: start with any non-ssl metadata from the DB record,
  // then reflect current Cloudflare SSL state as ssl.* keys
  const domain_metadata: Record<string, string> = {
    ...(result.domain_metadata || {}),
    "ssl.method": result.ssl.method,
    "ssl.type": result.ssl.type,
    "ssl.certificate_authority": result.ssl.certificate_authority,
  };

  return {
    custom_domain_id: result.id,
    domain: result.hostname,
    primary: result.primary,
    status: result.status === "active" ? "ready" : "pending",
    type: result.type ?? "auth0_managed_certs",
    verification: {
      methods: z.array(verificationMethodsSchema).parse(methods),
    },
    domain_metadata,
  };
}

export function createCustomDomainsAdapter(
  config: CloudflareConfig,
): CustomDomainsAdapter {
  return {
    create: async (tenant_id: string, domain: CustomDomainInsert) => {
      const { sslOverrides, rest } = extractSslFromMetadata(
        domain.domain_metadata,
      );

      const { result, errors, success } = customDomainResponseSchema.parse(
        await getClient(config)
          .post(
            {
              hostname: domain.domain,
              ssl: {
                method: "txt",
                type: "dv",
                ...sslOverrides,
              },
              custom_metadata: config.enterprise
                ? {
                    tenant_id,
                  }
                : undefined,
            },
            "/custom_hostnames",
          )
          .json(),
      );

      if (!success) {
        throw new Error(JSON.stringify(errors));
      }

      const customDomain = mapCustomDomainResponse({
        ...result,
        primary: false,
        type: domain.type,
        domain_metadata: rest,
      });

      // Persist the row, then mirror the Cloudflare-derived state
      // (status, verification) so list() and get() can render without
      // calling Cloudflare. domain_metadata is intentionally left at
      // whatever the caller supplied — the ssl.* echo from CF is
      // informational and surfacing it in the live response only.
      await config.customDomainAdapter.create(tenant_id, {
        custom_domain_id: customDomain.custom_domain_id,
        domain: customDomain.domain,
        type: customDomain.type,
        domain_metadata: domain.domain_metadata,
      });
      await config.customDomainAdapter.update(
        tenant_id,
        customDomain.custom_domain_id,
        {
          status: customDomain.status,
          primary: customDomain.primary,
          verification: customDomain.verification,
        },
      );

      return customDomain;
    },
    get: async (tenant_id: string, domain_id: string) => {
      // Start by fetching the custom domain from the database to make sure it's available for this tenant
      const customDomain = await config.customDomainAdapter.get(
        tenant_id,
        domain_id,
      );

      if (!customDomain) {
        throw new HTTPException(404);
      }

      // Fall back to the DB-authoritative record when Cloudflare is
      // unreachable or returns an unparseable response. status, verification,
      // and domain_metadata are mirrored on every create/update, so the DB
      // row is enough to render this domain.
      let body: unknown;
      try {
        body = await getClient(config)
          .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
          .json();
      } catch {
        return customDomain;
      }

      const parsed = customDomainResponseSchema.safeParse(body);
      if (!parsed.success || !parsed.data.success) {
        return customDomain;
      }

      const { result } = parsed.data;

      if (
        config.enterprise &&
        result.custom_metadata?.tenant_id !== tenant_id
      ) {
        throw new HTTPException(404);
      }

      // Merge the database data with the Cloudflare data
      return mapCustomDomainResponse({ ...customDomain, ...result });
    },
    getByDomain: async (domain: string) => {
      // This is used for tenant id resolution and needs to be fast
      return config.customDomainAdapter.getByDomain(domain);
    },
    list: async (tenant_id: string) => {
      // Read straight from the DB — Cloudflare state is mirrored on every
      // create/update/verify, so this stays fast (no N+1 to the CF API)
      // and the admin UI is no longer empty when CF is unreachable or has
      // drifted out of sync.
      return config.customDomainAdapter.list(tenant_id);
    },
    remove: async (tenant_id: string, domain_id: string) => {
      if (config.enterprise) {
        const { result, success } = customDomainResponseSchema.parse(
          await getClient(config)
            .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
            .json(),
        );

        if (!success || result.custom_metadata?.tenant_id !== tenant_id) {
          throw new HTTPException(404);
        }
      }

      const response = await getClient(config)
        .delete(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
        .res();

      if (response.ok) {
        await config.customDomainAdapter.remove(tenant_id, domain_id);
      }

      return response.ok;
    },
    update: async (
      tenant_id: string,
      domain_id: string,
      custom_domain: Partial<CustomDomain>,
    ) => {
      const { sslOverrides } = extractSslFromMetadata(
        custom_domain.domain_metadata,
      );

      const cfPayload: Record<string, unknown> = {};

      // If there are ssl.* overrides, fetch the current SSL state from
      // Cloudflare and merge so we always send a complete ssl object
      if (Object.keys(sslOverrides).length > 0) {
        let currentBody: unknown;
        try {
          currentBody = await getClient(config)
            .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
            .json();
        } catch (err) {
          throw new HTTPException(503, {
            message: `Failed to fetch current custom hostname state: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        const parsed = customDomainResponseSchema.safeParse(currentBody);
        if (!parsed.success || !parsed.data.success) {
          throw new HTTPException(503, {
            message: `Failed to parse current custom hostname state: ${JSON.stringify(parsed.success ? parsed.data.errors : parsed.error.issues)}`,
          });
        }

        cfPayload.ssl = {
          method: parsed.data.result.ssl.method,
          type: parsed.data.result.ssl.type,
          certificate_authority: parsed.data.result.ssl.certificate_authority,
          ...sslOverrides,
        };
      }

      if (Object.keys(cfPayload).length > 0) {
        const response = await getClient(config)
          .patch(
            cfPayload,
            `/custom_hostnames/${encodeURIComponent(domain_id)}`,
          )
          .res()
          .catch((err: unknown) => {
            throw new HTTPException(503, {
              message: `Failed to update custom hostname: ${err instanceof Error ? err.message : String(err)}`,
            });
          });

        if (!response.ok) {
          throw new HTTPException(503, {
            message: await response.text(),
          });
        }
      }

      return config.customDomainAdapter.update(
        tenant_id,
        domain_id,
        custom_domain,
      );
    },
    uploadCertificate: async (
      tenant_id: string,
      domain_id: string,
      cert: CustomDomainCertificateUpload,
    ) => {
      const existing = await config.customDomainAdapter.get(
        tenant_id,
        domain_id,
      );
      if (!existing) {
        throw new HTTPException(404);
      }

      const response = await getClient(config)
        .patch(
          {
            ssl: {
              custom_certificate: cert.certificate,
              custom_key: cert.private_key,
            },
          },
          `/custom_hostnames/${encodeURIComponent(domain_id)}`,
        )
        .json();

      const { result, errors, success } =
        customDomainResponseSchema.parse(response);

      if (!success) {
        throw new HTTPException(503, {
          message: JSON.stringify(errors),
        });
      }

      const customDomain = mapCustomDomainResponse({ ...existing, ...result });

      // Mirror the new Cloudflare state so list()/get() reflect the upload
      // without having to call Cloudflare again.
      await config.customDomainAdapter.update(tenant_id, domain_id, {
        status: customDomain.status,
        verification: customDomain.verification,
      });

      return customDomain;
    },
  };
}
