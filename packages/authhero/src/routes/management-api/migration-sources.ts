import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  LogTypes,
  MigrationSource,
  migrationSourceInsertSchema,
  migrationSourceSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";

const REDACTED = "***";

const migrationSourceResponseSchema = migrationSourceSchema.extend({
  credentials: migrationSourceSchema.shape.credentials.extend({
    client_secret: z.string(),
  }),
});

function redact(source: MigrationSource): MigrationSource {
  return {
    ...source,
    credentials: { ...source.credentials, client_secret: REDACTED },
  };
}

function getAdapter(ctx: { env: Bindings }) {
  const adapter = ctx.env.data.migrationSources;
  if (!adapter) {
    throw new HTTPException(501, {
      message: "Migration sources are not supported by this adapter",
    });
  }
  return adapter;
}

export const migrationSourcesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // GET /api/v2/migration-sources
  .openapi(
    createRoute({
      tags: ["migration-sources"],
      method: "get",
      path: "/",
      request: {
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:migration_sources"] }],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(migrationSourceResponseSchema),
            },
          },
          description: "List of migration sources",
        },
      },
    }),
    async (ctx) => {
      const adapter = getAdapter(ctx);
      const result = await adapter.list(ctx.var.tenant_id);
      return ctx.json(result.map(redact));
    },
  )
  // GET /api/v2/migration-sources/:id
  .openapi(
    createRoute({
      tags: ["migration-sources"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:migration_sources"] }],
      responses: {
        200: {
          content: {
            "application/json": { schema: migrationSourceResponseSchema },
          },
          description: "A migration source",
        },
      },
    }),
    async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const source = await adapter.get(ctx.var.tenant_id, id);
      if (!source) {
        throw new HTTPException(404);
      }
      return ctx.json(redact(source));
    },
  )
  // POST /api/v2/migration-sources
  .openapi(
    createRoute({
      tags: ["migration-sources"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(migrationSourceInsertSchema.shape),
            },
          },
        },
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["create:migration_sources"] }],
      responses: {
        201: {
          content: {
            "application/json": { schema: migrationSourceResponseSchema },
          },
          description: "The created migration source",
        },
      },
    }),
    async (ctx) => {
      const adapter = getAdapter(ctx);
      const body = ctx.req.valid("json");
      const source = await adapter.create(ctx.var.tenant_id, body);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Create a Migration Source",
        targetType: "migration_source",
        targetId: source.id,
        afterState: redact(source) as Record<string, unknown>,
      });

      return ctx.json(redact(source), { status: 201 });
    },
  )
  // PATCH /api/v2/migration-sources/:id
  .openapi(
    createRoute({
      tags: ["migration-sources"],
      method: "patch",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object(migrationSourceInsertSchema.shape).partial(),
            },
          },
        },
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["update:migration_sources"] }],
      responses: {
        200: {
          content: {
            "application/json": { schema: migrationSourceResponseSchema },
          },
          description: "The updated migration source",
        },
      },
    }),
    async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const ok = await adapter.update(ctx.var.tenant_id, id, body);
      if (!ok) {
        throw new HTTPException(404);
      }
      const source = await adapter.get(ctx.var.tenant_id, id);
      if (!source) {
        throw new HTTPException(404);
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update a Migration Source",
        targetType: "migration_source",
        targetId: id,
        afterState: redact(source) as Record<string, unknown>,
      });

      return ctx.json(redact(source));
    },
  )
  // DELETE /api/v2/migration-sources/:id
  .openapi(
    createRoute({
      tags: ["migration-sources"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({ id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["delete:migration_sources"] }],
      responses: {
        204: { description: "Migration source deleted" },
      },
    }),
    async (ctx) => {
      const adapter = getAdapter(ctx);
      const { id } = ctx.req.valid("param");
      const ok = await adapter.remove(ctx.var.tenant_id, id);
      if (!ok) {
        throw new HTTPException(404);
      }

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete a Migration Source",
        targetType: "migration_source",
        targetId: id,
      });

      return ctx.body(null, 204);
    },
  );
