import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  breachedPasswordDetectionSchema,
  bruteForceProtectionSchema,
  suspiciousIpThrottlingSchema,
  AttackProtection,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";

import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
type Section = keyof AttackProtection;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Recursively merge `source` into `target` so nested objects (e.g.
// breached_password_detection.stage["pre-user-registration"]) preserve sibling
// keys instead of being overwritten wholesale by a partial PATCH.
function deepMerge<T>(target: T, source: unknown): T {
  if (!isPlainObject(source)) return target;
  const base: Record<string, unknown> = isPlainObject(target)
    ? { ...target }
    : {};
  for (const [k, v] of Object.entries(source)) {
    base[k] = isPlainObject(v) ? deepMerge(base[k], v) : v;
  }
  return base as T;
}

async function getSection<S extends Section>(
  ctx: { env: Bindings; var: Variables },
  section: S,
): Promise<NonNullable<AttackProtection[S]>> {
  const tenantId = requireTenantId(ctx);
  const tenant = await ctx.env.data.tenants.get(tenantId);
  if (!tenant) {
    throw new HTTPException(404, { message: "Tenant not found" });
  }
  return (tenant.attack_protection?.[section] ?? {}) as NonNullable<
    AttackProtection[S]
  >;
}

async function patchSection<S extends Section>(
  ctx: { env: Bindings; var: Variables },
  section: S,
  patch: AttackProtection[S],
): Promise<NonNullable<AttackProtection[S]>> {
  const tenantId = requireTenantId(ctx);
  const tenant = await ctx.env.data.tenants.get(tenantId);
  if (!tenant) {
    throw new HTTPException(404, { message: "Tenant not found" });
  }
  const existing = tenant.attack_protection ?? {};
  const mergedSection = deepMerge(existing[section] ?? {}, patch ?? {});
  const next: AttackProtection = {
    ...existing,
    [section]: mergedSection,
  };
  await ctx.env.data.tenants.update(tenantId, {
    attack_protection: next,
  });

  await logMessage(ctx as any, tenantId, {
    type: LogTypes.SUCCESS_API_OPERATION,
    description: `Update Attack Protection (${section})`,
    targetType: "attack_protection",
    targetId: tenantId,
  });

  return next[section] as NonNullable<AttackProtection[S]>;
}
const getBreachedPasswordDetection = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "get",
    path: "/breached-password-detection",
    request: { headers: z.object({ "tenant-id": z.string().optional() }) },
    security: [{ Bearer: ["read:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: breachedPasswordDetectionSchema },
        },
        description: "Breached password detection settings",
      },
    },
  }),
  handler: async (ctx) =>
    ctx.json(await getSection(ctx, "breached_password_detection")),
});

const patchBreachedPasswordDetection = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "patch",
    path: "/breached-password-detection",
    request: {
      body: {
        content: {
          "application/json": { schema: breachedPasswordDetectionSchema },
        },
      },
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["update:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: breachedPasswordDetectionSchema },
        },
        description: "Updated settings",
      },
    },
  }),
  handler: async (ctx) => {
    const body = breachedPasswordDetectionSchema.parse(await ctx.req.json());
    return ctx.json(
      await patchSection(ctx, "breached_password_detection", body),
    );
  },
});

const getBruteForceProtection = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "get",
    path: "/brute-force-protection",
    request: { headers: z.object({ "tenant-id": z.string().optional() }) },
    security: [{ Bearer: ["read:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: bruteForceProtectionSchema },
        },
        description: "Brute force protection settings",
      },
    },
  }),
  handler: async (ctx) =>
    ctx.json(await getSection(ctx, "brute_force_protection")),
});

const patchBruteForceProtection = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "patch",
    path: "/brute-force-protection",
    request: {
      body: {
        content: {
          "application/json": { schema: bruteForceProtectionSchema },
        },
      },
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["update:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: bruteForceProtectionSchema },
        },
        description: "Updated settings",
      },
    },
  }),
  handler: async (ctx) => {
    const body = bruteForceProtectionSchema.parse(await ctx.req.json());
    return ctx.json(await patchSection(ctx, "brute_force_protection", body));
  },
});

const getSuspiciousIpThrottling = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "get",
    path: "/suspicious-ip-throttling",
    request: { headers: z.object({ "tenant-id": z.string().optional() }) },
    security: [{ Bearer: ["read:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: suspiciousIpThrottlingSchema },
        },
        description: "Suspicious IP throttling settings",
      },
    },
  }),
  handler: async (ctx) =>
    ctx.json(await getSection(ctx, "suspicious_ip_throttling")),
});

const patchSuspiciousIpThrottling = defineRoute({
  route: createRoute({
    tags: ["attack-protection"],
    method: "patch",
    path: "/suspicious-ip-throttling",
    request: {
      body: {
        content: {
          "application/json": { schema: suspiciousIpThrottlingSchema },
        },
      },
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["update:attack_protection"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: suspiciousIpThrottlingSchema },
        },
        description: "Updated settings",
      },
    },
  }),
  handler: async (ctx) => {
    const body = suspiciousIpThrottlingSchema.parse(await ctx.req.json());
    return ctx.json(await patchSection(ctx, "suspicious_ip_throttling", body));
  },
});

export const attackProtectionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getBreachedPasswordDetection,
  patchBreachedPasswordDetection,
  getBruteForceProtection,
  patchBruteForceProtection,
  getSuspiciousIpThrottling,
  patchSuspiciousIpThrottling,
] as const);
