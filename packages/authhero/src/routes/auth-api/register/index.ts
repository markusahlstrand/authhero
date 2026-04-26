import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { Client, ClientInsert } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../../types";
import { JSONHTTPException } from "../../../errors/json-http-exception";
import { logMessage } from "../../../helpers/logging";
import { mintRegistrationToken } from "../../../helpers/dcr/mint-token";
import { enforceConstraints } from "../../../helpers/dcr/constraint-enforcement";
import {
  dcrRequestSchema,
  dcrResponseSchema,
  dcrRequestToClient,
  clientToDcrResponse,
} from "../../../helpers/dcr/metadata-mapping";
import { isPlainObject } from "@authhero/adapter-interfaces";
import {
  authenticateManagementRequest,
  authenticateRegistrationRequest,
  assertDcrEnabled,
  generateClientId,
  generateClientSecret,
  isClientSoftDeleted,
  loadTenantOrFail,
  registrationClientUri,
  requireClientRegistrationTokens,
} from "./shared";

function readIatConstraints(
  registrationMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!registrationMetadata) return undefined;
  const value = registrationMetadata.iat_constraints;
  return isPlainObject(value) ? value : undefined;
}

function validateRedirectUris(uris: string[] | undefined) {
  if (!uris) return;
  for (const u of uris) {
    try {
      const parsed = new URL(u);
      if (!parsed.protocol || !parsed.host) {
        throw new JSONHTTPException(400, {
          error: "invalid_redirect_uri",
          error_description: `Invalid redirect_uri: ${u}`,
        });
      }
    } catch {
      throw new JSONHTTPException(400, {
        error: "invalid_redirect_uri",
        error_description: `Invalid redirect_uri: ${u}`,
      });
    }
  }
}

function validateGrantTypesAllowed(
  requested: string[] | undefined,
  allowlist: string[] | undefined,
) {
  if (!requested || !allowlist || allowlist.length === 0) return;
  for (const gt of requested) {
    if (!allowlist.includes(gt)) {
      throw new JSONHTTPException(400, {
        error: "invalid_client_metadata",
        error_description: `grant_type "${gt}" is not allowed for this tenant`,
      });
    }
  }
}

export const registerRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /oidc/register  (RFC 7591)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oidc-register"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: dcrRequestSchema,
            },
          },
        },
      },
      responses: {
        201: {
          content: {
            "application/json": { schema: dcrResponseSchema },
          },
          description: "Client registered",
        },
      },
    }),
    async (ctx) => {
      const tenant = await loadTenantOrFail(ctx);
      assertDcrEnabled(tenant);

      const iat = await authenticateRegistrationRequest(ctx, tenant);
      const body = ctx.req.valid("json");

      // Enforce IAT pre-bound constraints against the raw request body
      // (before RFC -> Client mapping) so constraint keys stay in wire form.
      const constraintResult = enforceConstraints(iat?.constraints, body);
      if (!constraintResult.ok) {
        throw new JSONHTTPException(400, {
          error: "invalid_client_metadata",
          error_description: `Field "${constraintResult.violation?.field}" conflicts with Initial Access Token constraint`,
        });
      }

      const mergedRequestParse = dcrRequestSchema.safeParse(
        constraintResult.filled,
      );
      if (!mergedRequestParse.success) {
        throw new JSONHTTPException(400, {
          error: "invalid_client_metadata",
          error_description:
            "Merged request (with IAT constraints applied) is not valid RFC 7591 metadata",
        });
      }
      const mergedRequest = mergedRequestParse.data;
      if (
        mergedRequest.grant_types?.some(
          (gt) => gt === "authorization_code" || gt === "implicit",
        ) &&
        (!mergedRequest.redirect_uris ||
          mergedRequest.redirect_uris.length === 0)
      ) {
        throw new JSONHTTPException(400, {
          error: "invalid_redirect_uri",
          error_description:
            "redirect_uris is required for authorization_code and implicit grant types",
        });
      }
      validateRedirectUris(mergedRequest.redirect_uris);
      validateGrantTypesAllowed(
        mergedRequest.grant_types,
        tenant.flags?.dcr_allowed_grant_types,
      );

      const { clientFields, extraMetadata } = dcrRequestToClient(mergedRequest);

      const client_id = generateClientId();
      const client_secret = generateClientSecret();

      const rat = await mintRegistrationToken();

      const registration_metadata: Record<string, unknown> = {
        ...extraMetadata,
      };
      delete registration_metadata.iat_constraints;
      if (iat?.constraints) {
        registration_metadata.iat_constraints = iat.constraints;
      }

      const clientInsert: ClientInsert = {
        client_id,
        name: clientFields.name ?? `Client ${client_id.slice(0, 8)}`,
        client_secret,
        callbacks: clientFields.callbacks ?? [],
        grant_types: clientFields.grant_types ?? ["authorization_code"],
        token_endpoint_auth_method:
          clientFields.token_endpoint_auth_method ?? "client_secret_basic",
        logo_uri: clientFields.logo_uri,
        client_metadata: clientFields.client_metadata,
        owner_user_id: iat?.sub,
        registration_type: iat ? "iat_dcr" : "open_dcr",
        registration_metadata,
      };

      let createdClient: Client | undefined;

      await ctx.env.data.transaction(async (trx) => {
        const trxTokens = requireClientRegistrationTokens(trx);
        if (iat) {
          const marked = await trxTokens.markUsed(
            ctx.var.tenant_id,
            iat.id,
            new Date().toISOString(),
          );
          if (!marked) {
            throw new JSONHTTPException(401, {
              error: "invalid_token",
              error_description: "Initial access token already used",
            });
          }
        }

        createdClient = await trx.clients.create(
          ctx.var.tenant_id,
          clientInsert,
        );

        await trxTokens.create(ctx.var.tenant_id, {
          id: rat.id,
          token_hash: rat.token_hash,
          type: "rat",
          client_id,
          single_use: false,
        });
      });

      if (!createdClient) {
        throw new JSONHTTPException(500, {
          error: "server_error",
          error_description: "Failed to create client",
        });
      }

      const registration_client_uri = registrationClientUri(ctx, client_id);
      const response = clientToDcrResponse(createdClient, {
        client_secret,
        registration_access_token: rat.token,
        registration_client_uri,
        include_client_secret: true,
      });

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Dynamic Client Registration",
        targetType: "client",
        targetId: client_id,
      });

      return ctx.json(response, { status: 201 });
    },
  )
  // --------------------------------
  // GET /oidc/register/:client_id  (RFC 7592)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oidc-register"],
      method: "get",
      path: "/{client_id}",
      request: {
        params: z.object({ client_id: z.string() }),
      },
      responses: {
        200: {
          content: { "application/json": { schema: dcrResponseSchema } },
          description: "Client configuration",
        },
      },
    }),
    async (ctx) => {
      const tenant = await loadTenantOrFail(ctx);
      assertDcrEnabled(tenant);

      const { client_id } = ctx.req.valid("param");
      await authenticateManagementRequest(ctx, client_id);

      const client = await ctx.env.data.clients.get(
        ctx.var.tenant_id,
        client_id,
      );
      if (!client || isClientSoftDeleted(client)) {
        throw new JSONHTTPException(401, {
          error: "invalid_token",
          error_description: "Client not found",
        });
      }

      const response = clientToDcrResponse(client, {
        registration_client_uri: registrationClientUri(ctx, client_id),
        include_client_secret: false,
      });
      return ctx.json(response);
    },
  )
  // --------------------------------
  // PUT /oidc/register/:client_id  (RFC 7592)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oidc-register"],
      method: "put",
      path: "/{client_id}",
      request: {
        params: z.object({ client_id: z.string() }),
        body: {
          content: {
            "application/json": { schema: dcrRequestSchema },
          },
        },
      },
      responses: {
        200: {
          content: { "application/json": { schema: dcrResponseSchema } },
          description: "Updated client configuration",
        },
      },
    }),
    async (ctx) => {
      const tenant = await loadTenantOrFail(ctx);
      assertDcrEnabled(tenant);

      const { client_id } = ctx.req.valid("param");
      await authenticateManagementRequest(ctx, client_id);

      const existing = await ctx.env.data.clients.get(
        ctx.var.tenant_id,
        client_id,
      );
      if (!existing || isClientSoftDeleted(existing)) {
        throw new JSONHTTPException(401, {
          error: "invalid_token",
          error_description: "Client not found",
        });
      }

      const body = ctx.req.valid("json");

      if (body.client_id !== undefined && body.client_id !== client_id) {
        throw new JSONHTTPException(400, {
          error: "invalid_client_metadata",
          error_description: "client_id in body does not match URL",
        });
      }

      // Enforce IAT-pre-bound constraint immutability via registration_metadata.iat_constraints
      const iatConstraints = readIatConstraints(existing.registration_metadata);
      if (iatConstraints) {
        const check = enforceConstraints(iatConstraints, body);
        if (!check.ok) {
          throw new JSONHTTPException(400, {
            error: "invalid_client_metadata",
            error_description: `Field "${check.violation?.field}" was bound at registration time and cannot be changed`,
          });
        }
      }

      validateRedirectUris(body.redirect_uris);
      validateGrantTypesAllowed(
        body.grant_types,
        tenant.flags?.dcr_allowed_grant_types,
      );

      const { clientFields, extraMetadata } = dcrRequestToClient(body);

      // Preserve iat_constraints across PUT (replace semantics on everything else)
      const mergedMetadata: Record<string, unknown> = { ...extraMetadata };
      if (iatConstraints) {
        mergedMetadata.iat_constraints = iatConstraints;
      }

      // RFC 7592 §2.2 replace semantics: set every standard registration
      // field explicitly so omitted fields are reset to their RFC 7591
      // default (or cleared) rather than carrying over the previous value.
      // Fields mapped into client_metadata (client_uri, tos_uri, policy_uri,
      // jwks_uri, contacts, scope, software_id, software_version) and
      // registration_metadata (response_types, jwks) are replaced wholesale
      // by the freshly-built objects below. client_secret is intentionally
      // omitted — RFC 7592 PUT must not rotate it.
      const update: Partial<Client> = {
        name: clientFields.name ?? `Client ${client_id.slice(0, 8)}`,
        callbacks: clientFields.callbacks ?? [],
        grant_types: clientFields.grant_types ?? ["authorization_code"],
        token_endpoint_auth_method:
          clientFields.token_endpoint_auth_method ?? "client_secret_basic",
        logo_uri: clientFields.logo_uri,
        client_metadata: clientFields.client_metadata ?? {},
        registration_metadata: mergedMetadata,
      };

      const ok = await ctx.env.data.clients.update(
        ctx.var.tenant_id,
        client_id,
        update,
      );
      if (!ok) {
        throw new JSONHTTPException(500, {
          error: "server_error",
          error_description: "Failed to update client",
        });
      }

      const updated = await ctx.env.data.clients.get(
        ctx.var.tenant_id,
        client_id,
      );
      if (!updated) {
        throw new JSONHTTPException(500, {
          error: "server_error",
          error_description: "Failed to read back updated client",
        });
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "RFC 7592 Client Update",
        targetType: "client",
        targetId: client_id,
      });

      const response = clientToDcrResponse(updated, {
        registration_client_uri: registrationClientUri(ctx, client_id),
        include_client_secret: false,
      });
      return ctx.json(response);
    },
  )
  // --------------------------------
  // DELETE /oidc/register/:client_id  (RFC 7592)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oidc-register"],
      method: "delete",
      path: "/{client_id}",
      request: {
        params: z.object({ client_id: z.string() }),
      },
      responses: {
        204: { description: "Client deleted" },
      },
    }),
    async (ctx) => {
      const tenant = await loadTenantOrFail(ctx);
      assertDcrEnabled(tenant);

      const { client_id } = ctx.req.valid("param");
      await authenticateManagementRequest(ctx, client_id);

      const existing = await ctx.env.data.clients.get(
        ctx.var.tenant_id,
        client_id,
      );
      if (!existing || isClientSoftDeleted(existing)) {
        throw new JSONHTTPException(401, {
          error: "invalid_token",
          error_description: "Client not found",
        });
      }

      const metadata: Record<string, string> = {
        ...(existing.client_metadata ?? {}),
        status: "deleted",
      };

      await ctx.env.data.transaction(async (trx) => {
        await trx.clients.update(ctx.var.tenant_id, client_id, {
          client_metadata: metadata,
        });
        await requireClientRegistrationTokens(trx).revokeByClient(
          ctx.var.tenant_id,
          client_id,
          new Date().toISOString(),
        );
      });

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "RFC 7592 Client Delete",
        targetType: "client",
        targetId: client_id,
      });

      return ctx.body(null, 204);
    },
  );
