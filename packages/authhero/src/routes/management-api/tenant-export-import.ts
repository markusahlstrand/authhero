import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
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
  const rawBody = ctx.req.raw.body;
  if (!rawBody) return "";

  const source = rawBody.getReader();

  // Sniff the first non-empty chunk for the gzip magic bytes (0x1f 0x8b)
  // without materializing the whole upload, then decide how to decode the rest.
  let firstChunk: Uint8Array | undefined;
  let compressed = 0;
  while (!firstChunk) {
    const { value, done } = await source.read();
    if (done) break;
    if (value && value.byteLength) {
      firstChunk = value;
      compressed = value.byteLength;
    }
  }
  if (!firstChunk) return "";
  if (compressed > MAX_COMPRESSED_BYTES) {
    await source.cancel();
    throw new HTTPException(413, {
      message: `Import payload exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`,
    });
  }

  const isGzip = firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;

  // Request-body chunks are typed as possibly SharedArrayBuffer-backed
  // (Uint8Array<ArrayBufferLike>); the BufferSource sinks below (TextDecoder and
  // the gzip writer) only accept ArrayBuffer-backed views, so normalize once.
  const toBytes = (chunk: Uint8Array): Uint8Array<ArrayBuffer> =>
    new Uint8Array(chunk);

  const decoder = new TextDecoder();
  let text = "";
  let decoded = 0;

  // Plain (non-gzip) path: decode each chunk straight to text, enforcing the
  // (here identical) size cap as bytes arrive. No intermediate byte buffer.
  if (!isGzip) {
    let chunk: Uint8Array | undefined = firstChunk;
    for (;;) {
      if (!chunk) {
        const { value, done } = await source.read();
        if (done) break;
        if (!value) continue;
        chunk = value;
        compressed += chunk.byteLength;
        if (compressed > MAX_COMPRESSED_BYTES) {
          await source.cancel();
          throw new HTTPException(413, {
            message: `Import payload exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`,
          });
        }
      }
      text += decoder.decode(toBytes(chunk), { stream: true });
      chunk = undefined;
    }
    text += decoder.decode();
    return text;
  }

  // Gzip path: pump compressed chunks into a DecompressionStream while draining
  // the inflated output concurrently — enforcing the compressed cap on the way
  // in and the decoded cap on the way out, so a gzip bomb is aborted the moment
  // it crosses either limit and the whole upload is never materialized at once.
  const inflater = new DecompressionStream("gzip");
  const writer = inflater.writable.getWriter();
  const reader = inflater.readable.getReader();

  const pump = (async () => {
    let chunk: Uint8Array | undefined = firstChunk;
    try {
      for (;;) {
        if (!chunk) {
          const { value, done } = await source.read();
          if (done) break;
          if (!value) continue;
          chunk = value;
          compressed += chunk.byteLength;
          if (compressed > MAX_COMPRESSED_BYTES) {
            throw new HTTPException(413, {
              message: `Import payload exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`,
            });
          }
        }
        await writer.write(toBytes(chunk));
        chunk = undefined;
      }
      await writer.close();
    } catch (err) {
      await source.cancel().catch(() => {});
      await writer.abort(err).catch(() => {});
      throw err;
    }
  })();

  const drain = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      decoded += value.byteLength;
      if (decoded > MAX_DECODED_BYTES) {
        await reader.cancel();
        throw new HTTPException(413, {
          message: `Decoded import payload exceeds the ${MAX_DECODED_BYTES}-byte limit`,
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  })();

  await Promise.all([pump, drain]);
  return text;
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
      500: {
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
        description:
          "Export failed before the response body could be streamed.",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
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

    // Prefetch a bounded prefix of the export *before* committing the
    // response. The body streams, so returning the Response locks in status
    // 200 + headers; any adapter failure after that can only surface as
    // `controller.error`, which truncates the gzip to its 10-byte header and
    // hands the client a 200 with a corrupt file. Buffering the first rows
    // up-front means a failure anywhere in them — in practice the entirety of
    // small and medium tenants — comes back as a real 5xx (and a log entry)
    // instead. Only exports larger than this window can still truncate
    // mid-stream, and those at least carry a partial body that shows where
    // they stopped.
    const PREFETCH_MAX_LINES = 1000;
    const PREFETCH_MAX_BYTES = 1024 * 1024;
    const prefetched: Uint8Array<ArrayBuffer>[] = [];
    let prefetchedBytes = 0;
    let exhausted = false;
    try {
      while (
        prefetched.length < PREFETCH_MAX_LINES &&
        prefetchedBytes < PREFETCH_MAX_BYTES
      ) {
        const { value, done } = await iterator.next();
        if (done) {
          exhausted = true;
          break;
        }
        const chunk = encoder.encode(JSON.stringify(value) + "\n");
        prefetched.push(chunk);
        prefetchedBytes += chunk.byteLength;
        rowCount += 1;
      }
    } catch (err) {
      await logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_API_OPERATION,
        description: `Tenant export failed after ${rowCount} rows (password_hashes=${includePasswordHashes}) by ${ctx.var.user?.sub ?? "unknown"}: ${err instanceof Error ? err.message : String(err)}`,
        targetType: "tenant",
        targetId: tenant_id,
      }).catch(() => {});
      throw new HTTPException(500, { message: "Tenant export failed" });
    }

    const ndjson = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        // Drain the prefetched prefix before resuming the iterator.
        const buffered = prefetched.shift();
        if (buffered) {
          controller.enqueue(buffered);
          return;
        }
        try {
          const next = exhausted ? undefined : await iterator.next();
          if (!next || next.done) {
            if (!logged) {
              logged = true;
              // waitForCompletion: this runs inside the stream, after the
              // middleware chain finished — a waitUntil-scheduled write can be
              // dropped, so await the log write itself before closing. Swallow
              // its errors: every row is already produced, and a failed audit
              // write must not error the stream and corrupt a complete export.
              await logMessage(ctx, tenant_id, {
                type: LogTypes.SUCCESS_API_OPERATION,
                description: `Tenant export (${rowCount} rows, password_hashes=${includePasswordHashes}) by ${ctx.var.user?.sub ?? "unknown"}`,
                targetType: "tenant",
                targetId: tenant_id,
                waitForCompletion: true,
              }).catch(() => {});
            }
            controller.close();
            return;
          }
          rowCount += 1;
          controller.enqueue(encoder.encode(JSON.stringify(next.value) + "\n"));
        } catch (err) {
          // Mid-stream failure: status 200 is already on the wire, so the
          // client still gets a truncated body — but at least record why.
          // waitForCompletion: awaited directly because a waitUntil-scheduled
          // write can be dropped once the stream errors. Never let a failed
          // log write mask the original error.
          if (!logged) {
            logged = true;
            await logMessage(ctx, tenant_id, {
              type: LogTypes.FAILED_API_OPERATION,
              description: `Tenant export failed after ${rowCount} rows (password_hashes=${includePasswordHashes}) by ${ctx.var.user?.sub ?? "unknown"}: ${err instanceof Error ? err.message : String(err)}`,
              targetType: "tenant",
              targetId: tenant_id,
              waitForCompletion: true,
            }).catch(() => {});
          }
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
    const tenant_id = requireTenantId(ctx);
    const includePasswordHashes =
      ctx.req.query("include_password_hashes") === "true";
    if (includePasswordHashes) {
      requireScope(ctx, IMPORT_SECRETS_SCOPE);
    }

    // Reading the body can fail during gzip decompression (corrupt payload) as
    // well as during JSON parsing; both must map to 400. Size-limit failures
    // (413, thrown as HTTPException by readBody) surface as-is.
    let lines: ExportLine[];
    try {
      lines = parseJsonl(await readBody(ctx));
    } catch (err) {
      if (err instanceof HTTPException) throw err;
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
