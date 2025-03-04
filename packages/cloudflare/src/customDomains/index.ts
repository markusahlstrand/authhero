import {
  CustomDomainInsert,
  CustomDomainsAdapter,
} from "@authhero/adapter-interfaces";
import wretch from "wretch";
import { retry, dedupe } from "wretch/middlewares";
import { CloudflareConfig } from "../types/CloudflareConfig";
import { CustomDomainResponseSchema } from "../types/CustomDomain";

function getClient(config: CloudflareConfig) {
  return wretch(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}`)
    .headers({
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    })
    .middlewares([retry(), dedupe()]);
}

export function createCustomDomainsAdapter(
  config: CloudflareConfig,
): CustomDomainsAdapter {
  return {
    create: async (tenant_id: string, domain: CustomDomainInsert) => {
      const { result, errors, success } = CustomDomainResponseSchema.parse(
        await getClient(config)
          .post(
            {
              hostname: domain.domain,
              ssl: {
                method: "http",
                type: "dv",
              },
            },
            "/custom_hostnames",
          )
          .json(),
      );

      if (!success) {
        throw new Error(JSON.stringify(errors));
      }

      return {
        custom_domain_id: result.id,
        tenant_id,
        domain: result.ssl.hosts[0]!,
        primary: false,
        status: result.status === "active" ? "ready" : "pending",
        type: "auth0_managed_certs",
      };
    },
    get: async (tenant_id: string, domain: string) => {
      console.log("get", tenant_id, domain);
      throw new Error("Not implemented");
    },
    list: async (tenant_id: string) => {
      console.log("list", tenant_id);
      throw new Error("Not implemented");
    },
    remove: async (tenant_id: string, domain: string) => {
      console.log("remove", tenant_id, domain);
      throw new Error("Not implemented");
    },
    update: async (tenant_id: string, domain: string) => {
      console.log("update", tenant_id, domain);
      throw new Error("Not implemented");
    },
  };
}
