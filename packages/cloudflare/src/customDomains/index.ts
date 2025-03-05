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

function mapCustomDomainResponse(result: CustomDomainResult): CustomDomain {
  return {
    custom_domain_id: result.id,
    domain: result.hostname,
    primary: false,
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

      return mapCustomDomainResponse(result);
    },
    get: async (tenant_id: string, domain_id: string) => {
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

      return mapCustomDomainResponse(result);
    },
    list: async (tenant_id: string) => {
      const { result, errors, success } = customDomainListResponseSchema.parse(
        await getClient(config).get("/custom_hostnames").json(),
      );

      if (!success) {
        throw new HTTPException(503, {
          message: JSON.stringify(errors),
        });
      }

      return result
        .filter(
          (domain) =>
            !(
              config.enterprise &&
              domain.custom_metadata?.tenant_id !== tenant_id
            ),
        )
        .map(mapCustomDomainResponse);
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

      return response.ok;
    },
    update: async (tenant_id: string, domain: string) => {
      console.log("update", tenant_id, domain);
      throw new Error("Not implemented");
    },
  };
}
