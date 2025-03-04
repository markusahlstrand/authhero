import wretch from "wretch";
import { retry, dedupe } from "wretch/middlewares";

export interface CloudflareApiParams {
  zone_id: string;
  api_key: string;
}

export interface CustomDomainsParams extends CloudflareApiParams {
  domain: string;
}

function getClient(params: CloudflareApiParams) {
  return wretch(`https://api.cloudflare.com/client/v4/zones/${params.zone_id}`)
    .headers({
      Authorization: `Bearer ${params.api_key}`,
      "Content-Type": "application/json",
    })
    .middlewares([retry(), dedupe()]);
}

export async function registerCustomDomain(params: CustomDomainsParams) {
  const result = await getClient(params)
    .post(
      {
        hostname: params.domain,
        ssl: {
          method: "http",
          type: "dv",
        },
      },
      "/custom_hostnames",
    )
    .json();

  return result;
}

export async function getCustomDomain(params: CustomDomainsParams) {
  const result = await getClient(params)
    .get(`/custom_hostnames/${encodeURIComponent(params.domain)}`)
    .json();

  return result;
}
