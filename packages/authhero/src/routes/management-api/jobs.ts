import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import type {
  TenantOperation,
  TenantOperationRowInsert,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { defineRoute } from "../../utils/define-route";
import { logMessage } from "../../helpers/logging";
import { waitUntil } from "../../helpers/wait-until";
import { LogTypes } from "@authhero/adapter-interfaces";
import { resolveUsernamePasswordProvider } from "../../utils/username-password-provider";
import {
  jobErrorsSchema,
  jobSchema,
  userImportEntrySchema,
} from "../../types/auth0/UserImport";
import {
  entryIdentityKeys,
  IMPORT_ERROR_CODES,
  redactEntry,
  toStagedPayload,
} from "../../helpers/users-import/map";
import {
  advanceUsersImport,
  DEFAULT_CHUNK_SIZE,
} from "../../helpers/users-import/process";

type RouteContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Auth0's documented ceiling for a users-import file. Kept as the default
 * rather than a hard constant so an operator running a large migration can
 * raise it, while any Auth0-shaped client sees identical behaviour.
 */
export const DEFAULT_MAX_IMPORT_BYTES = 500 * 1024;

/** Auth0 allows two concurrent import jobs per tenant. */
export const DEFAULT_MAX_CONCURRENT_IMPORT_JOBS = 2;

/**
 * How much work the accepting request does before handing the rest to the
 * background sweep. Deliberately small: the response should not wait on a
 * long import, and every row it does not process is safely `pending`.
 */
const INLINE_KICK_ROWS = DEFAULT_CHUNK_SIZE;

const JOB_TYPE = "users_import";

/** Auth0 job ids are `job_`-prefixed; internal operation ids are `op_`. */
function toJobId(operationId: string): string {
  return `job_${operationId}`;
}

function toOperationId(jobId: string): string {
  return jobId.startsWith("job_") ? jobId.slice(4) : jobId;
}

/**
 * Project AuthHero's internal operation status onto Auth0's three-value job
 * status. Internal values (`running`, `succeeded`, `cancelled`) and engine
 * names are never exposed.
 */
function toJobStatus(
  operation: TenantOperation,
): "pending" | "completed" | "failed" {
  switch (operation.status) {
    case "succeeded":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" ? value : fallback;
}

function buildJobResponse(operation: TenantOperation) {
  const input =
    typeof operation.input === "object" && operation.input !== null
      ? (operation.input as Record<string, unknown>)
      : {};
  const result =
    typeof operation.result === "object" && operation.result !== null
      ? (operation.result as Record<string, unknown>)
      : {};

  const total = numberOr(result.total, 0);
  const inserted = numberOr(result.inserted, 0);
  const updated = numberOr(result.updated, 0);
  const failed = numberOr(result.failed, 0);
  const processed = inserted + updated + failed;

  const percentage_done =
    total > 0 ? Math.floor((processed / total) * 100) : total === 0 ? 100 : 0;

  // Estimate from observed throughput rather than a fixed guess, so the
  // number is meaningful for both a 100-row and a 100k-row migration.
  let time_left_seconds = 0;
  if (processed > 0 && processed < total) {
    const elapsedMs = Date.now() - new Date(operation.created_at).getTime();
    const msPerRow = elapsedMs / processed;
    time_left_seconds = Math.max(
      0,
      Math.round((msPerRow * (total - processed)) / 1000),
    );
  }

  const status = toJobStatus(operation);

  return {
    id: toJobId(operation.id),
    type: JOB_TYPE,
    status,
    created_at: operation.created_at,
    connection_id: stringOr(input.connection_id),
    external_id: stringOr(input.external_id),
    percentage_done,
    time_left_seconds,
    ...(operation.error ? { status_details: operation.error } : {}),
    summary: { total, inserted, updated, failed },
  };
}

function requireAdapters(ctx: RouteContext) {
  const { tenantOperations, tenantOperationRows } = ctx.env.data;
  if (!tenantOperations || !tenantOperationRows) {
    throw new HTTPException(501, {
      message:
        "Bulk user import is not available: this deployment has no tenantOperations/tenantOperationRows adapters",
    });
  }
  return { tenantOperations, tenantOperationRows };
}

/**
 * Load a job and confirm it belongs to the caller's tenant. A job from
 * another tenant must be indistinguishable from one that does not exist.
 */
async function getOwnedOperation(
  ctx: RouteContext,
  jobId: string,
): Promise<TenantOperation> {
  const { tenantOperations } = requireAdapters(ctx);
  const operation = await tenantOperations.get(toOperationId(jobId));
  if (
    !operation ||
    operation.kind !== "users_import" ||
    operation.tenant_id !== ctx.var.tenant_id
  ) {
    throw new HTTPException(404, { message: "Job not found" });
  }
  return operation;
}

const postUsersImports = defineRoute({
  route: createRoute({
    tags: ["jobs"],
    method: "post",
    path: "/users-imports",
    request: {
      headers: z.object({ "tenant-id": z.string().optional() }),
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              users: z.any().openapi({
                type: "string",
                format: "binary",
                description:
                  "JSON file containing an array of users to import.",
              }),
              connection_id: z.string().openapi({
                description: "Id of the database connection to import into.",
              }),
              upsert: z.union([z.string(), z.boolean()]).optional().openapi({
                description:
                  "When true, update users that already match on user_id, email, username or phone. Defaults to false.",
              }),
              external_id: z.string().optional().openapi({
                description: "Caller-supplied correlation id, echoed back.",
              }),
              send_completion_email: z
                .union([z.string(), z.boolean()])
                .optional(),
            }),
          },
        },
      },
    },
    security: [{ Bearer: ["create:users"] }],
    responses: {
      202: {
        content: { "application/json": { schema: jobSchema } },
        description: "The import job was accepted and is now running.",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    if (!tenant_id) {
      throw new HTTPException(400, { message: "A tenant is required" });
    }
    const { tenantOperations, tenantOperationRows } = requireAdapters(ctx);

    const form = await ctx.req.parseBody();
    const file = form.users;
    const connection_id = form.connection_id;

    if (typeof connection_id !== "string" || connection_id.length === 0) {
      throw new HTTPException(400, { message: "connection_id is required" });
    }
    if (!(file instanceof File)) {
      throw new HTTPException(400, {
        message: "A users file is required",
      });
    }

    const maxBytes = ctx.env.usersImportMaxBytes ?? DEFAULT_MAX_IMPORT_BYTES;
    if (file.size > maxBytes) {
      throw new HTTPException(400, {
        message: `The users file exceeds the ${maxBytes}-byte limit`,
      });
    }

    const connection = await ctx.env.data.connections.get(
      tenant_id,
      connection_id,
    );
    if (!connection) {
      throw new HTTPException(400, {
        message: `Connection ${connection_id} not found`,
      });
    }

    // Auth0 caps concurrent imports per tenant; beyond it the API rate-limits.
    const maxConcurrent =
      ctx.env.usersImportMaxConcurrentJobs ??
      DEFAULT_MAX_CONCURRENT_IMPORT_JOBS;
    const inFlight = await tenantOperations.list({
      tenant_id,
      kind: "users_import",
      status: ["pending", "running"],
      page: 0,
      per_page: maxConcurrent + 1,
    });
    if (inFlight.operations.length >= maxConcurrent) {
      throw new HTTPException(429, {
        message: `This tenant already has ${maxConcurrent} import jobs in progress`,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new HTTPException(400, {
        message: "The users file is not valid JSON",
      });
    }
    if (!Array.isArray(parsed)) {
      throw new HTTPException(400, {
        message: "The users file must contain a JSON array of users",
      });
    }
    if (parsed.length === 0) {
      throw new HTTPException(400, {
        message: "The users file contains no users",
      });
    }

    const provider = await resolveUsernamePasswordProvider(ctx.env, tenant_id);

    const operation = await tenantOperations.create({
      tenant_id,
      kind: "users_import",
      // Durability comes from the staged rows, not from an engine, so the
      // accepting request records itself as the engine that started the work.
      engine: "inline",
      initiated_by: ctx.var.user?.sub ?? "system",
      input: {
        connection_id,
        connection: connection.name,
        provider,
        upsert: form.upsert === "true",
        ...(typeof form.external_id === "string"
          ? { external_id: form.external_id }
          : {}),
        send_completion_email: form.send_completion_email === "true",
      },
    });

    // Stage every entry before returning. The staged row is the durable work
    // item, so it keeps the credential it exists to import; redaction happens
    // when a row is read back by the errors endpoint.
    const seen = new Set<string>();
    const staged: TenantOperationRowInsert[] = parsed.map((entry, seq) => {
      const base: TenantOperationRowInsert = {
        operation_id: operation.id,
        seq,
        payload: toStagedPayload(entry),
        status: "pending",
      };

      const validated = userImportEntrySchema.safeParse(entry);
      if (!validated.success) return base;

      const keys = entryIdentityKeys(validated.data);
      const duplicate = keys.find((key) => seen.has(key));
      if (duplicate) {
        return {
          ...base,
          status: "failed",
          error_code: IMPORT_ERROR_CODES.DUPLICATE_ENTRY,
          error_message: `Duplicate entry: ${duplicate.split(":")[0]} appears earlier in this file`,
          error_path: duplicate.split(":")[0],
        };
      }
      keys.forEach((key) => seen.add(key));
      return base;
    });

    await tenantOperationRows.createMany(staged);
    await tenantOperations.update(operation.id, {
      result: {
        total: staged.length,
        inserted: 0,
        updated: 0,
        failed: staged.filter((row) => row.status === "failed").length,
      },
    });

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESSFULLY_IMPORTED_USERS,
      description: `Bulk user import ${toJobId(operation.id)} accepted (${staged.length} users) by ${ctx.var.user?.sub ?? "unknown"}`,
      targetType: "tenant",
      targetId: tenant_id,
    });

    // Make a start now so small imports finish before the client's first
    // poll, but never block the response on the whole file. Whatever this
    // does not reach stays `pending` for the resume sweep.
    waitUntil(
      ctx,
      advanceUsersImport(ctx.env.data, operation.id, {
        maxRows: INLINE_KICK_ROWS,
      }).catch((error) => {
        console.warn(
          `Initial pass for users_import ${operation.id} failed:`,
          error instanceof Error ? error.message : error,
        );
      }),
    );

    const created = (await tenantOperations.get(operation.id)) ?? operation;
    return ctx.json(buildJobResponse(created), 202);
  },
});

const getJobById = defineRoute({
  route: createRoute({
    tags: ["jobs"],
    method: "get",
    path: "/{id}",
    request: {
      params: z.object({ id: z.string() }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["create:users", "read:users"] }],
    responses: {
      200: {
        content: { "application/json": { schema: jobSchema } },
        description: "The job.",
      },
    },
  }),
  handler: async (ctx) => {
    const operation = await getOwnedOperation(ctx, ctx.req.valid("param").id);
    return ctx.json(buildJobResponse(operation));
  },
});

const getJobErrors = defineRoute({
  route: createRoute({
    tags: ["jobs"],
    method: "get",
    path: "/{id}/errors",
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({
        page: z.coerce.number().int().min(0).optional(),
        per_page: z.coerce.number().int().min(1).max(100).optional(),
      }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["create:users", "read:users"] }],
    responses: {
      200: {
        content: { "application/json": { schema: jobErrorsSchema } },
        description: "Per-user errors from the import.",
      },
      204: {
        description: "The job was retrieved, but no errors were found.",
      },
    },
  }),
  handler: async (ctx) => {
    const operation = await getOwnedOperation(ctx, ctx.req.valid("param").id);
    const { tenantOperationRows } = requireAdapters(ctx);
    const { page, per_page } = ctx.req.valid("query");

    const failed = await tenantOperationRows.list(operation.id, {
      status: "failed",
      page: page ?? 0,
      per_page: per_page ?? 50,
    });

    if (failed.rows.length === 0) {
      return ctx.body(null, 204);
    }

    return ctx.json(
      failed.rows.map((row) => ({
        // Never echo an imported credential back over the API.
        user: redactEntry(row.payload),
        errors: [
          {
            code: row.error_code ?? IMPORT_ERROR_CODES.INTERNAL_ERROR,
            message: row.error_message ?? "Import failed",
            ...(row.error_path ? { path: row.error_path } : {}),
          },
        ],
      })),
    );
  },
});

export const jobsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([postUsersImports, getJobById, getJobErrors] as const);
