import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import {
  getProxyCustomDomainId,
  getProxyDomain,
  getProxyRequest,
  getProxyTenantId,
} from "./util";

const optionsSchema = z.object({
  // Name of the Cloudflare dispatch namespace binding to look up under
  // `bindings`. Configured in wrangler.toml as
  // `[[dispatch_namespaces]] binding = "DISPATCHER"`.
  binding: z.string(),
  // Script name to invoke inside the namespace. Supports `{tenant_id}`,
  // `{custom_domain_id}`, `{domain}`, and `{host}` placeholders, which are
  // substituted at request time from the resolved host context. A literal
  // value with no placeholders is also accepted.
  script_name: z.string(),
  // Optional CPU-time limit (ms) passed to the dispatcher binding. Cloudflare
  // enforces a per-script default; this caps it lower.
  cpu_ms: z.number().int().positive().optional(),
  // Optional subrequest limit passed to the dispatcher binding.
  subrequests: z.number().int().positive().optional(),
});

type Options = z.infer<typeof optionsSchema>;

export interface DispatchNamespaceBinding {
  get(
    name: string,
    options?: Record<string, unknown>,
    init?: { limits?: { cpuMs?: number; subrequests?: number } },
  ): {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>;
  };
}

function isDispatchNamespaceBinding(
  value: unknown,
): value is DispatchNamespaceBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

const PLACEHOLDER_RE = /\{(tenant_id|custom_domain_id|domain|host)\}/g;

function hasPlaceholder(template: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0;
  return PLACEHOLDER_RE.test(template);
}

export const dispatchNamespaceHandler = defineHandler<Options>({
  type: "dispatch_namespace",
  optionsSchema,
  build(options, ctx) {
    const dispatcher = ctx.bindings[options.binding];
    if (!isDispatchNamespaceBinding(dispatcher)) {
      throw new Error(
        `Dispatch namespace binding "${options.binding}" is not configured or does not expose .get()`,
      );
    }

    const needsTemplating = hasPlaceholder(options.script_name);
    const init =
      options.cpu_ms || options.subrequests
        ? {
            limits: {
              ...(options.cpu_ms ? { cpuMs: options.cpu_ms } : {}),
              ...(options.subrequests
                ? { subrequests: options.subrequests }
                : {}),
            },
          }
        : undefined;

    return async (c) => {
      let scriptName = options.script_name;
      if (needsTemplating) {
        const tenantId = getProxyTenantId(c);
        const customDomainId = getProxyCustomDomainId(c);
        const domain = getProxyDomain(c);
        const host =
          c.req.header("host") ?? c.req.header("x-forwarded-host") ?? "";
        scriptName = scriptName.replace(PLACEHOLDER_RE, (_, key: string) => {
          switch (key) {
            case "tenant_id":
              return tenantId ?? "";
            case "custom_domain_id":
              return customDomainId ?? "";
            case "domain":
              return domain ?? "";
            case "host":
              return host;
            default:
              return "";
          }
        });
        if (scriptName.includes("{") || scriptName === "") {
          return c.text(
            `dispatch_namespace: could not resolve script name from template "${options.script_name}"`,
            500,
          );
        }
      }

      const worker = dispatcher.get(scriptName, undefined, init);
      const req = getProxyRequest(c);
      return worker.fetch(req);
    };
  },
});
