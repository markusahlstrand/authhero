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
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
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
  const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
  if (!tenant) {
    throw new HTTPException(404, { message: "Tenant not found" });
  }
  const existing = tenant.attack_protection ?? {};
  const mergedSection = deepMerge(existing[section] ?? {}, patch ?? {});
  const next: AttackProtection = {
    ...existing,
    [section]: mergedSection,
  };
  await ctx.env.data.tenants.update(ctx.var.tenant_id, {
    attack_protection: next,
  });

  await logMessage(ctx as any, ctx.var.tenant_id, {
    type: LogTypes.SUCCESS_API_OPERATION,
    description: `Update Attack Protection (${section})`,
    targetType: "attack_protection",
    targetId: ctx.var.tenant_id,
  });

  return next[section] as NonNullable<AttackProtection[S]>;
}

export const attackProtectionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // GET /attack-protection/breached-password-detection
  .openapi(
    createRoute({
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
    async (ctx) =>
      ctx.json(await getSection(ctx, "breached_password_detection")),
  )
  // PATCH /attack-protection/breached-password-detection
  .openapi(
    createRoute({
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
    async (ctx) => {
      const body = breachedPasswordDetectionSchema.parse(await ctx.req.json());
      return ctx.json(
        await patchSection(ctx, "breached_password_detection", body),
      );
    },
  )
  // GET /attack-protection/brute-force-protection
  .openapi(
    createRoute({
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
    async (ctx) => ctx.json(await getSection(ctx, "brute_force_protection")),
  )
  // PATCH /attack-protection/brute-force-protection
  .openapi(
    createRoute({
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
    async (ctx) => {
      const body = bruteForceProtectionSchema.parse(await ctx.req.json());
      return ctx.json(await patchSection(ctx, "brute_force_protection", body));
    },
  )
  // GET /attack-protection/suspicious-ip-throttling
  .openapi(
    createRoute({
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
    async (ctx) => ctx.json(await getSection(ctx, "suspicious_ip_throttling")),
  )
  // PATCH /attack-protection/suspicious-ip-throttling
  .openapi(
    createRoute({
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
    async (ctx) => {
      const body = suspiciousIpThrottlingSchema.parse(await ctx.req.json());
      return ctx.json(
        await patchSection(ctx, "suspicious_ip_throttling", body),
      );
    },
  );
