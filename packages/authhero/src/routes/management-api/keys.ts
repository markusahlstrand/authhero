import { Context } from "hono";
import { Bindings, Variables } from "../../types";
import { createX509Certificate } from "../../utils/encryption";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { signingKeySchema } from "@authhero/adapter-interfaces";
import { resolveSigningKeyMode } from "../../helpers/signing-keys";

const DAY = 1000 * 60 * 60 * 24;

type KeyScope = "control-plane" | { tenantId: string };

// Resolve which key bucket this management-api request operates on. In the
// default `signingKeyMode === "control-plane"` mode the tenant-id header is
// just an auth scope — the keys themselves still live in the shared
// control-plane bucket — so we ignore it here. Only when the tenant has
// been switched to `"tenant"` mode do rotate/list/revoke work against the
// tenant-scoped rows.
async function resolveKeyScope(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<KeyScope> {
  const tenantId = ctx.var.tenant_id;
  if (!tenantId) return "control-plane";
  const mode = await resolveSigningKeyMode(ctx.env.signingKeyMode, tenantId);
  return mode === "tenant" ? { tenantId } : "control-plane";
}

// Keys with tenant_id IS NULL are the shared control-plane bucket. The
// kysely lucene filter matches `-_exists_:tenant_id` to that bucket and
// `tenant_id:X` to a specific tenant.
function scopedKeysQuery(scope: KeyScope): string {
  if (scope === "control-plane") {
    return "type:jwt_signing AND -_exists_:tenant_id";
  }
  return `type:jwt_signing AND tenant_id:${scope.tenantId}`;
}

export const keyRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /keys
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "get",
      path: "/signing",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:signing_keys"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(signingKeySchema),
            },
          },
          description: "List of keys",
        },
      },
    }),
    async (ctx) => {
      const scope = await resolveKeyScope(ctx);
      const { signingKeys } = await ctx.env.data.keys.list({
        q: scopedKeysQuery(scope),
      });

      const keys = signingKeys
        .filter((key) => "cert" in key)
        .map((key) => {
          return key;
        });

      return ctx.json(keys);
    },
  )
  // --------------------------------
  // GET /keys/signing/:kid
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "get",
      path: "/signing/{kid}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          // Restrict to characters that are safe to interpolate into the
          // Lucene-style q string the kysely adapter parses; thumbprint kids
          // are base64url so this allows real values while rejecting
          // injection attempts.
          kid: z.string().regex(/^[A-Za-z0-9._-]+$/),
        }),
      },
      security: [
        {
          Bearer: ["read:signing_keys"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: signingKeySchema,
            },
          },
          description: "The requested key",
        },
      },
    }),
    async (ctx) => {
      const { kid } = ctx.req.valid("param");

      const { signingKeys } = await ctx.env.data.keys.list({
        q: `type:jwt_signing AND kid:${kid}`,
      });
      const key = signingKeys.find((k) => k.kid === kid);
      if (!key) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      // Hide keys belonging to other tenants when scoped via tenant-id header.
      // Keys with no tenant_id are the shared control-plane bucket and remain
      // visible to all tenants — so an operator can still inspect the
      // fallback key during a per-tenant rollout.
      if (
        ctx.var.tenant_id &&
        key.tenant_id &&
        key.tenant_id !== ctx.var.tenant_id
      ) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      return ctx.json(key);
    },
  )
  // --------------------------------
  // POST /keys/signing/rotate
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "post",
      path: "/signing/rotate",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["create:signing_keys"],
        },
      ],
      responses: {
        201: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const scope = await resolveKeyScope(ctx);
      // Only revoke keys in the same scope we're rotating into; otherwise
      // rotating tenant X would also wipe the shared control-plane keys
      // every other tenant still depends on. The adapter already filters
      // out already-revoked rows, so paginate through what remains and
      // revoke every active key — a bounded per_page would silently leave
      // older keys signing tokens after a rotation.
      let page = 0;
      const perPage = 100;
      while (true) {
        const { signingKeys } = await ctx.env.data.keys.list({
          q: scopedKeysQuery(scope),
          page,
          per_page: perPage,
        });
        for (const key of signingKeys) {
          await ctx.env.data.keys.update(key.kid, {
            revoked_at: new Date(Date.now() + DAY).toISOString(),
          });
        }
        if (signingKeys.length < perPage) break;
        page++;
      }

      const signingKey = await createX509Certificate({
        name: `CN=${ctx.env.ORGANIZATION_NAME}`,
      });

      // Stamp `current_since` on the replacement so the resolveSigningKeys
      // tiebreaker picks it over the still-in-grace older keys; without
      // this, two unrevoked keys with no current_since fall through to a
      // kid-desc sort whose order depends on random thumbprint bytes.
      await ctx.env.data.keys.create({
        ...signingKey,
        type: "jwt_signing",
        current_since: new Date().toISOString(),
        ...(scope === "control-plane" ? {} : { tenant_id: scope.tenantId }),
      });

      return ctx.text("OK", { status: 201 });
    },
  )
  // --------------------------------
  // PUT /signing/:kid/revoke
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "put",
      path: "/signing/{kid}/revoke",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          // Restrict to characters that are safe to interpolate into the
          // Lucene-style q string the kysely adapter parses; thumbprint kids
          // are base64url so this allows real values while rejecting
          // injection attempts.
          kid: z.string().regex(/^[A-Za-z0-9._-]+$/),
        }),
      },
      security: [
        {
          Bearer: ["update:signing_keys"],
        },
      ],
      responses: {
        201: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { kid } = ctx.req.valid("param");
      const tenantId = ctx.var.tenant_id;

      // Look up the key first so we can mint the replacement in the same
      // scope (tenant or control-plane) and reject revocation requests for
      // keys owned by a different tenant.
      const { signingKeys } = await ctx.env.data.keys.list({
        q: `type:jwt_signing AND kid:${kid}`,
      });
      const existing = signingKeys.find((k) => k.kid === kid);
      if (!existing) {
        throw new HTTPException(404, { message: "Key not found" });
      }
      if (tenantId && existing.tenant_id && existing.tenant_id !== tenantId) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      const revoked = await ctx.env.data.keys.update(kid, {
        revoked_at: new Date().toISOString(),
      });
      if (!revoked) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      const signingKey = await createX509Certificate({
        name: `CN=${ctx.env.ORGANIZATION_NAME}`,
      });

      // See rotate handler: stamp current_since so the new key sorts ahead
      // of the just-revoked one in the resolveSigningKeys tiebreaker.
      await ctx.env.data.keys.create({
        ...signingKey,
        type: "jwt_signing",
        current_since: new Date().toISOString(),
        ...(existing.tenant_id ? { tenant_id: existing.tenant_id } : {}),
      });

      return ctx.text("OK");
    },
  );
