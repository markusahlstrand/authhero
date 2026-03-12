import {
  CustomDomain,
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
    type: "auth0_managed_certs",
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
        domain_metadata: rest,
      });

      // Store the custom domain in the database as well
      await config.customDomainAdapter.create(tenant_id, {
        custom_domain_id: customDomain.custom_domain_id,
        domain: customDomain.domain,
        type: customDomain.type,
        domain_metadata: domain.domain_metadata,
      });

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

      const body = await getClient(config)
        .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
        .json();

      const { result, errors, success } =
        customDomainResponseSchema.parse(body);

      if (!success) {
        throw new HTTPException(503, {
          message: JSON.stringify(errors),
        });
      }

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
      const customDomains = await config.customDomainAdapter.list(tenant_id);

      // Fetch each custom domain from Cloudflare by ID
      const results = await Promise.all(
        customDomains.map(async (customDomain) => {
          try {
            const body = await getClient(config)
              .get(
                `/custom_hostnames/${encodeURIComponent(customDomain.custom_domain_id)}`,
              )
              .json();

            const { result, success } = customDomainResponseSchema.parse(body);

            if (!success) {
              return null;
            }

            if (
              config.enterprise &&
              result.custom_metadata?.tenant_id !== tenant_id
            ) {
              return null;
            }

            return mapCustomDomainResponse({
              ...customDomain,
              ...result,
            });
          } catch {
            return null;
          }
        }),
      );

      return results.filter((r): r is CustomDomain => r !== null);
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
        const currentBody = await getClient(config)
          .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
          .json();

        const { result: currentResult, success: currentSuccess } =
          customDomainResponseSchema.parse(currentBody);

        if (!currentSuccess) {
          throw new HTTPException(503, {
            message: "Failed to fetch current custom hostname state",
          });
        }

        cfPayload.ssl = {
          method: currentResult.ssl.method,
          type: currentResult.ssl.type,
          certificate_authority: currentResult.ssl.certificate_authority,
          ...sslOverrides,
        };
      }

      if (Object.keys(cfPayload).length > 0) {
        const response = await getClient(config)
          .patch(
            cfPayload,
            `/custom_hostnames/${encodeURIComponent(domain_id)}`,
          )
          .res();

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
  };
}
