import {
  CustomDomain,
  CustomDomainInsert,
  CustomDomainsAdapter,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import wretch from "wretch";
import { retry, dedupe } from "wretch/middlewares";
import { CloudflareConfig } from "../types/CloudflareConfig";
import {
  customDomainListResponseSchema,
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

function mapCustomDomainResponse(
  result: CustomDomainResult & { primary: boolean },
): CustomDomain {
  return {
    custom_domain_id: result.id,
    domain: result.hostname,
    primary: result.primary,
    status: result.status === "active" ? "ready" : "pending",
    type: "auth0_managed_certs",
  };
}

export function createCustomDomainsAdapter(
  config: CloudflareConfig,
): CustomDomainsAdapter {
  return {
    create: async (tenant_id: string, domain: CustomDomainInsert) => {
      const { result, errors, success } = customDomainResponseSchema.parse(
        await getClient(config)
          .post(
            {
              hostname: domain.domain,
              ssl: {
                method: "http",
                type: "dv",
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
      });

      // Store the custom domain in the database as well
      await config.customDomainAdapter.create(tenant_id, {
        custom_domain_id: customDomain.custom_domain_id,
        domain: customDomain.domain,
        type: customDomain.type,
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

      const { result, errors, success } = customDomainResponseSchema.parse(
        await getClient(config)
          .get(`/custom_hostnames/${encodeURIComponent(domain_id)}`)
          .json(),
      );

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
    list: async (tenant_id: string) => {
      const customDomains = await config.customDomainAdapter.list(tenant_id);

      const { result, errors, success } = customDomainListResponseSchema.parse(
        await getClient(config).get("/custom_hostnames").json(),
      );

      if (!success) {
        throw new HTTPException(503, {
          message: JSON.stringify(errors),
        });
      }

      return (
        result
          // Make sure the custom domain is available for this tenant
          .filter((domain) =>
            customDomains.find((d) => d.custom_domain_id === domain.id),
          )
          .filter(
            (domain) =>
              !(
                config.enterprise &&
                domain.custom_metadata?.tenant_id !== tenant_id
              ),
          )
          .map((domain) =>
            mapCustomDomainResponse({
              ...customDomains.find((d) => d.custom_domain_id === domain.id)!,
              ...domain,
            }),
          )
      );
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
      const response = await getClient(config)
        .patch(
          custom_domain,
          `/custom_hostnames/${encodeURIComponent(domain_id)}`,
        )
        .res();

      if (!response.ok) {
        throw new HTTPException(503, {
          message: await response.text(),
        });
      }

      return config.customDomainAdapter.update(
        tenant_id,
        domain_id,
        custom_domain,
      );
    },
  };
}
