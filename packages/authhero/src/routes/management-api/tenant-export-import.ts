import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import { defineRoute } from "../../utils/define-route";
import {
  ExportLine,
  exportTenantLines,
  importTenant,
} from "../../helpers/tenant-export-import";

// Scope a token must additionally carry to include/import password hashes.
const EXPORT_SECRETS_SCOPE = "read:user_password_hashes";
const IMPORT_SECRETS_SCOPE = "create:user_password_hashes";

type RouteContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * All grants the token carries — both the space-delimited `scope` claim and the
 * RBAC `permissions` array (management-API tokens usually use the latter). The
 * auth middleware stores the full verified payload under `user`, so reading
 * `permissions` here is safe; it's just absent from the narrowed `user` type.
 */
function tokenGrants(ctx: RouteContext): string[] {
  const user = ctx.var.user;
  if (!user) return [];
  const scopes =
    typeof user.scope === "string" ? user.scope.split(" ").filter(Boolean) : [];
  const permissions =
    "permissions" in user ? asStringArray(user.permissions) : [];
  return [...scopes, ...permissions];
}

function requireScope(ctx: RouteContext, scope: string) {
  if (!tokenGrants(ctx).includes(scope)) {
    throw new HTTPException(403, {
      message: `Including password hashes requires the "${scope}" scope`,
    });
  }
}

const exportLineSchema = z.object({
  entity: z.string(),
  data: z.unknown(),
});

// Hard limits guarding the import path against oversized uploads and gzip
// bombs: a small compressed payload must not be allowed to inflate without
// bound and exhaust worker memory.
const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB on the wire
const MAX_DECODED_BYTES = 250 * 1024 * 1024; // 250 MB after inflation

/**
 * Decode the request body, transparently inflating a gzip payload, while
 * enforcing hard caps on both the compressed and decoded sizes so a gzip bomb
 * can't OOM the worker. Throws `HTTPException(413)` when either cap is exceeded.
 */
async function readBody(ctx: RouteContext): Promise<string> {
  const buffer = new Uint8Array(await ctx.req.arrayBuffer());
  if (buffer.byteLength > MAX_COMPRESSED_BYTES) {
    throw new HTTPException(413, {
      message: `Import payload exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`,
    });
  }

  // gzip magic bytes (0x1f 0x8b) — inflate; otherwise treat as plain text.
  const isGzip =
    buffer.byteLength >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const byteStream = isGzip
    ? new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
    : new Blob([buffer]).stream();

  // Drain the decoded stream chunk-by-chunk, enforcing the decoded cap as we go
  // so inflation is aborted the moment it crosses the limit.
  const reader = byteStream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new HTTPException(413, {
        message: `Decoded import payload exceeds the ${MAX_DECODED_BYTES}-byte limit`,
      });
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Parse newline-delimited JSON into validated export lines. */
function parseJsonl(text: string): ExportLine[] {
  const lines: ExportLine[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    lines.push(exportLineSchema.parse(JSON.parse(trimmed)));
  }
  return lines;
}

const importResultSchema = z.object({
  counts: z.record(z.string(), z.number()),
  errors: z.array(z.object({ entity: z.string(), error: z.string() })),
});

const exportRoute = defineRoute({
  route: createRoute({
    tags: ["tenant-export-import"],
    method: "get",
    path: "/export",
    request: {
      query: z.object({
        include_password_hashes: z
          .enum(["true", "false"])
          .optional()
          .openapi({
            description:
              "Include password hashes in the export. Requires the " +
              `"${EXPORT_SECRETS_SCOPE}" scope.`,
          }),
        gzip: z
          .enum(["true", "false"])
          .optional()
          .openapi({
            description:
              "Whether to gzip the response (default true). Pass false to " +
              "receive uncompressed `application/x-ndjson`.",
          }),
      }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["read:users"] }],
    responses: {
      200: {
        content: {
          "application/gzip": {
            schema: z.string().openapi({
              type: "string",
              format: "binary",
            }),
          },
          "application/x-ndjson": {
            schema: z.string(),
          },
        },
        description:
          "JSON-lines export of the tenant's durable data, one " +
          "`{ entity, data }` record per line (gzipped by default).",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const includePasswordHashes =
      ctx.req.query("include_password_hashes") === "true";
    if (includePasswordHashes) {
      requireScope(ctx, EXPORT_SECRETS_SCOPE);
    }
    const compress = ctx.req.query("gzip") !== "false";

    // Serialize each export line straight into the response (and into gzip)
    // without ever buffering the whole tenant dump in memory.
    const encoder = new TextEncoder();
    const iterator = exportTenantLines(ctx.env.data, tenant_id, {
      includePasswordHashes,
    })[Symbol.asyncIterator]();
    let rowCount = 0;
    let logged = false;

    const ndjson = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try {
          const { value, done } = await iterator.next();
          if (done) {
            if (!logged) {
              logged = true;
              await logMessage(ctx, tenant_id, {
                type: LogTypes.SUCCESS_API_OPERATION,
                description: `Tenant export (${rowCount} rows, password_hashes=${includePasswordHashes}) by ${ctx.var.user?.sub ?? "unknown"}`,
                targetType: "tenant",
                targetId: tenant_id,
              });
            }
            controller.close();
            return;
          }
          rowCount += 1;
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        } catch (err) {
          controller.error(err);
        }
      },
      async cancel() {
        await iterator.return?.(undefined);
      },
    });

    if (!compress) {
      return new Response(ndjson, {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson",
          "content-disposition": `attachment; filename="${tenant_id}-export.jsonl"`,
        },
      });
    }

    const body = ndjson.pipeThrough(new CompressionStream("gzip"));
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${tenant_id}-export.jsonl.gz"`,
      },
    });
  },
});

const importRoute = defineRoute({
  route: createRoute({
    tags: ["tenant-export-import"],
    method: "post",
    path: "/import",
    request: {
      query: z.object({
        include_password_hashes: z
          .enum(["true", "false"])
          .optional()
          .openapi({
            description:
              "Import password-hash records from the stream. Requires the " +
              `"${IMPORT_SECRETS_SCOPE}" scope.`,
          }),
      }),
      headers: z.object({ "tenant-id": z.string().optional() }),
    },
    security: [{ Bearer: ["create:users"] }],
    responses: {
      200: {
        content: { "application/json": { schema: importResultSchema } },
        description: "Per-entity counts and any non-fatal per-row errors.",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const includePasswordHashes =
      ctx.req.query("include_password_hashes") === "true";
    if (includePasswordHashes) {
      requireScope(ctx, IMPORT_SECRETS_SCOPE);
    }

    // Size-limit failures (413) must surface as-is; only a malformed body maps
    // to 400.
    const body = await readBody(ctx);
    let lines: ExportLine[];
    try {
      lines = parseJsonl(body);
    } catch {
      throw new HTTPException(400, {
        message: "Request body is not valid gzipped/plain JSON-lines",
      });
    }

    const result = await importTenant(ctx.env.data, tenant_id, lines, {
      includePasswordHashes,
    });

    const imported = Object.values(result.counts).reduce((a, b) => a + b, 0);
    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESSFULLY_IMPORTED_USERS,
      description: `Tenant import (${imported} rows, ${result.errors.length} errors, password_hashes=${includePasswordHashes}) by ${ctx.var.user?.sub ?? "unknown"}`,
      targetType: "tenant",
      targetId: tenant_id,
    });

    return ctx.json(result);
  },
});

export const tenantExportImportRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([exportRoute, importRoute] as const);
