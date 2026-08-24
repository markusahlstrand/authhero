import { Context } from "hono";
import { X509Certificate } from "@peculiar/x509";
import { Bindings, Variables } from "../../types";
import {
  createX509Certificate,
  renewX509Certificate,
} from "../../utils/encryption";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { SigningKey, signingKeySchema } from "@authhero/adapter-interfaces";
import {
  isSignable,
  isStaged,
  resolveSigningKeyMode,
} from "../../helpers/signing-keys";
import {
  JWT_CERT_VALIDITY_DAYS,
  SAML_CERT_VALIDITY_DAYS,
} from "../../constants";

import { isControlPlaneTenant } from "./tenants";
import { defineRoute } from "../../utils/define-route";
const DAY = 1000 * 60 * 60 * 24;

type KeyType = SigningKey["type"];

// Every route defaults to `jwt_signing` so existing callers — including the
// admin console before this change — keep addressing the same bucket.
const keyTypeQuerySchema = z
  .enum(["jwt_signing", "saml_encryption"])
  .default("jwt_signing")
  .openapi({
    description:
      "Which key bucket to operate on. `saml_encryption` keys sign SAML assertions.",
  });

const DEFAULT_VALIDITY_DAYS: Record<KeyType, number> = {
  jwt_signing: JWT_CERT_VALIDITY_DAYS,
  saml_encryption: SAML_CERT_VALIDITY_DAYS,
};

const validityDaysQuerySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(3650)
  .optional()
  .openapi({
    description:
      "Lifetime of the new certificate in days. Defaults to one year for JWT keys and five years for SAML keys.",
  });

const daysQuerySchema = z.coerce.number().int().min(0).max(365).optional();

// The management API must never hand back private key material: a caller with
// `read:signing_keys` is allowed to see which keys exist and to copy a public
// certificate, not to walk off with the ability to mint tokens.
const signingKeyResponseSchema = signingKeySchema.omit({ pkcs7: true }).extend({
  expires_at: z.string().optional().openapi({
    description:
      "When the certificate stops being valid (from the cert itself)",
  }),
  expired: z.boolean().optional().openapi({
    description: "True once `expires_at` is in the past",
  }),
  inherited: z.boolean().optional().openapi({
    description:
      "True when the key is not owned by the requesting scope: a shared control-plane key, or a public-only copy projected from one. Inherited keys are read-only.",
  }),
});

/**
 * Project a stored key into its API representation: drop the private key, and
 * surface the certificate's own expiry so an operator can see a certificate
 * ageing out before a service provider does it for them.
 */
function toResponse(
  key: SigningKey,
  flags: { current?: boolean; inherited?: boolean } = {},
): z.infer<typeof signingKeyResponseSchema> {
  const { pkcs7: _pkcs7, ...rest } = key;
  let expires_at: string | undefined;
  try {
    expires_at = new X509Certificate(key.cert).notAfter.toISOString();
  } catch {
    // A row whose cert can't be parsed still deserves to be listed — the
    // missing expiry is itself a useful signal in the console.
  }
  return {
    ...rest,
    ...(expires_at
      ? { expires_at, expired: new Date(expires_at) < new Date() }
      : {}),
    next: isStaged(key),
    current: flags.current ?? false,
    inherited: flags.inherited ?? false,
  };
}

/**
 * Who the caller is allowed to act for.
 *
 * `ownsSharedBucket` answers the question a key row cannot: when a request
 * resolves to the control-plane bucket, is that because the caller *is* the
 * control plane (or a single-tenant deployment whose own keys live there), or
 * because a tenant fell back to keys somebody else owns?
 *
 * `isControlPlaneTenant` is the same signal the tenants route uses for access
 * control: when `multiTenancyConfig.controlPlaneTenantId` is configured, any
 * other tenant is by definition not the control plane. When it isn't
 * configured the deployment is single-tenant, so the bucket is the caller's
 * own — which keeps single-tenant and dispatch-worker deployments, where a
 * tenant's own keys are stored unscoped, able to manage them.
 */
interface KeyAuthority {
  scope: KeyScope;
  ownsSharedBucket: boolean;
}

async function resolveKeyAuthority(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  type: KeyType,
): Promise<KeyAuthority> {
  const scope = await resolveKeyScope(ctx, type);
  const callerTenantId = ctx.var.tenant_id;
  const ownsSharedBucket =
    scope === "control-plane" &&
    (!callerTenantId || isControlPlaneTenant(ctx, callerTenantId));
  return { scope, ownsSharedBucket };
}

/**
 * Whether a key belongs to somebody other than the caller.
 *
 * Two cases, and neither may be mutated from here:
 *
 * - A key with no private material is a *projection*: the control plane holds
 *   the original and is still signing with it, and this copy exists only so
 *   the tenant can verify. Revoking or renewing it breaks verification of
 *   tokens the control plane keeps issuing (#1181).
 * - A shared control-plane key seen by a tenant is the one every other tenant
 *   is also using. A tenant inherits it — it must be able to verify with it —
 *   but rotating or revoking it is the control plane's business alone.
 */
function isInherited(key: SigningKey, authority: KeyAuthority): boolean {
  if (!isSignable(key)) return true;
  if (key.tenant_id) return false;
  return !authority.ownsSharedBucket;
}

/** Reject a mutation aimed at a key the caller doesn't own. */
function assertMutable(key: SigningKey, authority: KeyAuthority): void {
  if (!isInherited(key, authority)) return;
  throw new HTTPException(403, {
    message: isSignable(key)
      ? "This key is inherited from the control plane and can only be modified there"
      : "This key holds no private material — it is a copy of a control-plane key and cannot be modified",
  });
}

/** Reject a rotation that would revoke keys the caller doesn't own. */
function assertScopeMutable(authority: KeyAuthority): void {
  if (authority.scope !== "control-plane" || authority.ownsSharedBucket) return;
  throw new HTTPException(403, {
    message:
      "These signing keys are inherited from the control plane and can only be rotated there",
  });
}

type KeyScope = "control-plane" | { tenantId: string };

// Resolve which key bucket this management-api request operates on. In the
// default `signingKeyMode === "control-plane"` mode the tenant-id header is
// just an auth scope — the keys themselves still live in the shared
// control-plane bucket — so we ignore it here. Only when the tenant has
// been switched to `"tenant"` mode do rotate/list/revoke work against the
// tenant-scoped rows.
async function resolveKeyScope(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  type: KeyType,
): Promise<KeyScope> {
  const tenantId = ctx.var.tenant_id;
  if (!tenantId) return "control-plane";
  // SAML certificates are always tenant-scoped — see `resolveSigningKeys` —
  // so the console rotates a tenant's own certificate rather than the shared
  // one every other tenant's service providers are also pinning.
  if (type === "saml_encryption") return { tenantId };
  const mode = await resolveSigningKeyMode(ctx.env.signingKeyMode, tenantId);
  return mode === "tenant" ? { tenantId } : "control-plane";
}

// Keys with tenant_id IS NULL are the shared control-plane bucket. The
// kysely lucene filter matches `-_exists_:tenant_id` to that bucket and
// `tenant_id:X` to a specific tenant.
// `CN=${ORGANIZATION_NAME}` renders as the literal "CN=undefined" when the
// binding isn't set — which is how existing certificates ended up with an
// undefined subject. Fall back to something that identifies the deployment.
function certificateName(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  scope: KeyScope,
): string {
  const name =
    ctx.env.ORGANIZATION_NAME ||
    (scope === "control-plane" ? undefined : scope.tenantId) ||
    "authhero";
  return `CN=${name}`;
}

/**
 * Look up one key by kid within the caller's tenant scope.
 *
 * Keys with no `tenant_id` are the shared control-plane bucket and stay
 * visible to every tenant; another tenant's key is reported as missing rather
 * than forbidden, so the endpoint doesn't confirm that the kid exists.
 */
async function findKeyByKid(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  kid: string,
  type: KeyType,
): Promise<SigningKey> {
  const { signingKeys } = await ctx.env.data.keys.list({
    q: `type:${type} AND kid:${kid}`,
  });
  const existing = signingKeys.find((k) => k.kid === kid);
  if (!existing) {
    throw new HTTPException(404, { message: "Key not found" });
  }
  const tenantId = ctx.var.tenant_id;
  if (tenantId && existing.tenant_id && existing.tenant_id !== tenantId) {
    throw new HTTPException(404, { message: "Key not found" });
  }
  return existing;
}

function scopedKeysQuery(scope: KeyScope, type: KeyType): string {
  if (scope === "control-plane") {
    return `type:${type} AND -_exists_:tenant_id`;
  }
  return `type:${type} AND tenant_id:${scope.tenantId}`;
}
const getSigning = defineRoute({
  route: createRoute({
    tags: ["keys"],
    method: "get",
    path: "/signing",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      query: z.object({
        type: keyTypeQuerySchema,
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
            schema: z.array(signingKeyResponseSchema),
          },
        },
        description: "List of keys",
      },
    },
  }),
  handler: async (ctx) => {
    const { type } = ctx.req.valid("query");
    const authority = await resolveKeyAuthority(ctx, type);
    const { scope } = authority;

    const byActivation = (a: SigningKey, b: SigningKey) =>
      new Date(b.current_since ?? 0).getTime() -
      new Date(a.current_since ?? 0).getTime();

    const owned = await ctx.env.data.keys.list({
      q: scopedKeysQuery(scope, type),
    });

    // A tenant-scoped caller also falls back to the shared control-plane keys
    // at runtime, so list them too rather than leaving the console showing a
    // set of keys that isn't the set in use. They come back flagged as
    // inherited, and the mutating routes refuse them.
    const inherited =
      scope === "control-plane"
        ? { signingKeys: [] }
        : await ctx.env.data.keys.list({
            q: scopedKeysQuery("control-plane", type),
          });

    const seen = new Set<string>();
    const keys = [
      ...owned.signingKeys.sort(byActivation),
      ...inherited.signingKeys.sort(byActivation),
    ].filter((key) => {
      if (!("cert" in key) || seen.has(key.kid)) return false;
      seen.add(key.kid);
      return true;
    });

    // Mirror the resolveSigningKeys preference so the console labels the same
    // key that actually signs: owned before inherited, newest activation
    // first, staged and public-only keys excluded.
    const currentKid = keys.find(
      (key) => isSignable(key) && !isStaged(key),
    )?.kid;

    return ctx.json(
      keys.map((key) =>
        toResponse(key, {
          current: key.kid === currentKid,
          inherited: isInherited(key, authority),
        }),
      ),
    );
  },
});

const getSigningByKid = defineRoute({
  route: createRoute({
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
      query: z.object({
        type: keyTypeQuerySchema,
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
            schema: signingKeyResponseSchema,
          },
        },
        description: "The requested key",
      },
    },
  }),
  handler: async (ctx) => {
    const { kid } = ctx.req.valid("param");
    const { type } = ctx.req.valid("query");

    const { signingKeys } = await ctx.env.data.keys.list({
      q: `type:${type} AND kid:${kid}`,
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

    return ctx.json(toResponse(key));
  },
});

const postSigningRotate = defineRoute({
  route: createRoute({
    tags: ["keys"],
    method: "post",
    path: "/signing/rotate",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      query: z.object({
        type: keyTypeQuerySchema,
        validity_days: validityDaysQuerySchema,
        // A SAML service provider can't discover the new certificate on its
        // own, so staging exists to give an operator time to deliver it: the
        // new key is published immediately but doesn't sign until it activates.
        // Default 0 keeps JWT rotations immediate, as before.
        activate_in_days: daysQuerySchema.openapi({
          description:
            "Publish the new key now but only start signing with it after this many days. Defaults to 0 (immediately).",
        }),
        // Grace runs from activation, not from now, so a staged rotation can't
        // retire the outgoing key before the incoming one takes over.
        grace_days: daysQuerySchema.openapi({
          description:
            "How long the outgoing keys stay valid after the new key activates. Defaults to 1.",
        }),
      }),
    },
    security: [
      {
        Bearer: ["create:signing_keys"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: signingKeyResponseSchema,
          },
        },
        description: "The newly created key",
      },
    },
  }),
  handler: async (ctx) => {
    const { type, validity_days, activate_in_days, grace_days } =
      ctx.req.valid("query");
    const authority = await resolveKeyAuthority(ctx, type);
    const { scope } = authority;
    // A tenant inherits the control plane's keys; rotating them would revoke
    // what every other tenant is verifying against.
    assertScopeMutable(authority);
    const activatesAt = new Date(Date.now() + (activate_in_days ?? 0) * DAY);
    const revokesAt = new Date(activatesAt.getTime() + (grace_days ?? 1) * DAY);
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
        q: scopedKeysQuery(scope, type),
        page,
        per_page: perPage,
      });
      for (const key of signingKeys) {
        // Never revoke a public-only key: in control-plane scope a WFP tenant's
        // keyset also holds the control plane's PUBLIC verify keys, projected
        // with private material stripped (`pkcs7` null). Those are copies the
        // tenant doesn't own and the real control plane is still signing with —
        // revoking them here severs verification of control-plane admin tokens
        // while the control plane keeps issuing them. Only rotate out keys this
        // scope actually signs with (private material present).
        if (!isSignable(key)) {
          continue;
        }
        await ctx.env.data.keys.update(key.kid, {
          revoked_at: revokesAt.toISOString(),
        });
      }
      if (signingKeys.length < perPage) break;
      page++;
    }

    const signingKey = await createX509Certificate({
      name: certificateName(ctx, scope),
      validityDays: validity_days ?? DEFAULT_VALIDITY_DAYS[type],
    });

    // Stamp `current_since` on the replacement so the resolveSigningKeys
    // tiebreaker picks it over the still-in-grace older keys; without
    // this, two unrevoked keys with no current_since fall through to a
    // kid-desc sort whose order depends on random thumbprint bytes. A
    // future value additionally marks the key as staged.
    const created: SigningKey = {
      ...signingKey,
      type,
      current_since: activatesAt.toISOString(),
      ...(scope === "control-plane" ? {} : { tenant_id: scope.tenantId }),
    };
    await ctx.env.data.keys.create(created);

    return ctx.json(
      toResponse(created, {
        current: !isStaged(created),
        inherited: isInherited(created, authority),
      }),
      201,
    );
  },
});

const putSigningByKidRevoke = defineRoute({
  route: createRoute({
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
      query: z.object({
        type: keyTypeQuerySchema,
        validity_days: validityDaysQuerySchema,
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
  handler: async (ctx) => {
    const { kid } = ctx.req.valid("param");
    const { type, validity_days } = ctx.req.valid("query");

    // Look up the key first so we can mint the replacement in the same
    // scope (tenant or control-plane) and reject revocation requests for
    // keys owned by a different tenant.
    const existing = await findKeyByKid(ctx, kid, type);
    // Revoking a key this scope doesn't own would cut off verification for
    // whoever does own it — the control plane keeps signing with the original.
    assertMutable(existing, await resolveKeyAuthority(ctx, type));

    const revoked = await ctx.env.data.keys.update(kid, {
      revoked_at: new Date().toISOString(),
    });
    if (!revoked) {
      throw new HTTPException(404, { message: "Key not found" });
    }

    const signingKey = await createX509Certificate({
      name: certificateName(
        ctx,
        existing.tenant_id ? { tenantId: existing.tenant_id } : "control-plane",
      ),
      validityDays: validity_days ?? DEFAULT_VALIDITY_DAYS[type],
    });

    // See rotate handler: stamp current_since so the new key sorts ahead
    // of the just-revoked one in the resolveSigningKeys tiebreaker.
    await ctx.env.data.keys.create({
      ...signingKey,
      type,
      current_since: new Date().toISOString(),
      ...(existing.tenant_id ? { tenant_id: existing.tenant_id } : {}),
    });

    return ctx.text("OK");
  },
});

const postSigningByKidRenew = defineRoute({
  route: createRoute({
    tags: ["keys"],
    method: "post",
    path: "/signing/{kid}/renew",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        kid: z.string().regex(/^[A-Za-z0-9._-]+$/),
      }),
      query: z.object({
        type: keyTypeQuerySchema,
        validity_days: validityDaysQuerySchema,
      }),
    },
    security: [
      {
        Bearer: ["create:signing_keys"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: signingKeyResponseSchema,
          },
        },
        description: "The renewed key",
      },
    },
  }),
  /**
   * Re-issue this key's certificate over its existing key pair.
   *
   * Rotation is the right default — it replaces the key material. Renewal is
   * the escape hatch for a SAML service provider that pins the certificate and
   * can't be updated on our schedule: the public key, and therefore the `kid`
   * and the signature verification path, are unchanged, so only a service
   * provider that compares the certificate bytes needs anything from us.
   */
  handler: async (ctx) => {
    const { kid } = ctx.req.valid("param");
    const { type, validity_days } = ctx.req.valid("query");

    const existing = await findKeyByKid(ctx, kid, type);
    const authority = await resolveKeyAuthority(ctx, type);
    assertMutable(existing, authority);

    const renewed = await renewX509Certificate({
      cert: existing.cert,
      pkcs7: existing.pkcs7!,
      validityDays: validity_days ?? DEFAULT_VALIDITY_DAYS[type],
    });

    // `fingerprint` is deliberately left alone: it identifies the public key,
    // which renewal doesn't touch, and some rows predate the current
    // fingerprint scheme — rewriting it would silently change their identity.
    const updated = await ctx.env.data.keys.update(kid, {
      cert: renewed.cert,
      thumbprint: renewed.thumbprint,
    });
    if (!updated) {
      throw new HTTPException(404, { message: "Key not found" });
    }

    return ctx.json(
      toResponse(
        { ...existing, cert: renewed.cert, thumbprint: renewed.thumbprint },
        { current: !isStaged(existing), inherited: false },
      ),
    );
  },
});

export const keyRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getSigning,
  getSigningByKid,
  postSigningRotate,
  postSigningByKidRenew,
  putSigningByKidRevoke,
] as const);
