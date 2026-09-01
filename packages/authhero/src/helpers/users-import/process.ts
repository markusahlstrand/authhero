import type {
  DataAdapters,
  TenantOperation,
  TenantOperationRow,
  TenantOperationRowOutcome,
} from "@authhero/adapter-interfaces";
import {
  userImportEntrySchema,
  type UserImportEntry,
} from "../../types/auth0/UserImport";
import {
  buildUserId,
  IMPORT_ERROR_CODES,
  mapEntry,
  type ImportRowError,
} from "./map";

/**
 * How many staged rows one chunk processes.
 *
 * Sized against Cloudflare D1's per-invocation query cap (order of a
 * thousand): a row costs up to four existence probes plus a user and a
 * password write, so 50 rows leaves comfortable headroom for the
 * surrounding reads and the outcome commit. Chunks are cheap — a smaller
 * one only means more of them, while an oversized one fails the whole
 * invocation.
 */
export const DEFAULT_CHUNK_SIZE = 50;

/** How long a driver's lease on an operation is valid. */
export const DEFAULT_LEASE_MS = 60_000;

export interface UsersImportInput {
  connection_id: string;
  connection: string;
  upsert: boolean;
  external_id?: string;
  send_completion_email?: boolean;
  provider: string;
}

export interface AdvanceOptions {
  /** Stop after this many rows, so a driver can bound its own runtime. */
  maxRows?: number;
  /** Rows per chunk; defaults to {@link DEFAULT_CHUNK_SIZE}. */
  chunkSize?: number;
  /** Lease duration for this driver's claim. */
  leaseMs?: number;
  /**
   * Wall-clock deadline (epoch ms). The driver stops cleanly at the next
   * chunk boundary once passed, leaving the remainder `pending` for the
   * next driver — never mid-chunk, so no work is half-committed.
   */
  deadline?: number;
  /** Identifies the lease holder; defaults to a random id. */
  workerId?: string;
}

export interface AdvanceResult {
  /** True when no `pending` rows remain and the operation was finalized. */
  done: boolean;
  /** Rows this call committed an outcome for. */
  processed: number;
  /** Rows still `pending` after this call. */
  remaining: number;
  /** False when another live driver holds the lease. */
  claimed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Read the operation's `input` back into a typed shape. The row is written
 * by the accept route, so a malformed one means the operation is
 * unrunnable rather than that the caller made a mistake.
 */
export function parseImportInput(
  operation: TenantOperation,
): UsersImportInput | null {
  const input = operation.input;
  if (!isRecord(input)) return null;

  const connection_id = asOptionalString(input.connection_id);
  const connection = asOptionalString(input.connection);
  const provider = asOptionalString(input.provider);
  if (!connection_id || !connection || !provider) return null;

  return {
    connection_id,
    connection,
    provider,
    upsert: input.upsert === true,
    external_id: asOptionalString(input.external_id),
    send_completion_email: input.send_completion_email === true,
  };
}

function errorOutcome(
  seq: number,
  error: ImportRowError,
): TenantOperationRowOutcome {
  return {
    seq,
    status: "failed",
    error_code: error.code,
    error_message: error.message,
    error_path: error.path ?? null,
  };
}

/** Look a user up by one indexed field, or null when nothing matches. */
async function findByField(
  data: DataAdapters,
  tenantId: string,
  field: string,
  value: string,
): Promise<string | null> {
  const escaped = value.replace(/"/g, '\\"');
  const result = await data.users.list(tenantId, {
    q: `${field}:"${escaped}"`,
    page: 0,
    per_page: 1,
    include_totals: false,
  });
  return result.users[0]?.user_id ?? null;
}

/**
 * Locate an existing user for an upsert, matching the identifiers Auth0
 * matches on: user_id, email, username, then phone.
 *
 * Probes are short-circuited and only run for fields the entry actually
 * carries, so the common email-only entry costs a single query — which
 * matters, because this runs once per row inside a query-capped invocation.
 */
async function findExistingUser(
  data: DataAdapters,
  tenantId: string,
  entry: UserImportEntry,
  provider: string,
): Promise<string | null> {
  if (entry.user_id !== undefined) {
    const byId = await data.users.get(
      tenantId,
      buildUserId(entry.user_id, provider),
    );
    if (byId) return byId.user_id;
  }

  const byEmail = await findByField(data, tenantId, "email", entry.email);
  if (byEmail) return byEmail;

  if (entry.username !== undefined) {
    const byUsername = await findByField(
      data,
      tenantId,
      "username",
      entry.username,
    );
    if (byUsername) return byUsername;
  }

  if (entry.phone_number !== undefined) {
    const byPhone = await findByField(
      data,
      tenantId,
      "phone_number",
      entry.phone_number,
    );
    if (byPhone) return byPhone;
  }

  return null;
}

/**
 * Write one staged row. Returns the outcome to commit; never throws for
 * per-row problems, so one bad entry cannot abort a chunk.
 */
async function processRow(
  data: DataAdapters,
  tenantId: string,
  row: TenantOperationRow,
  input: UsersImportInput,
): Promise<TenantOperationRowOutcome> {
  const parsed = userImportEntrySchema.safeParse(row.payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorOutcome(row.seq, {
      code: IMPORT_ERROR_CODES.VALIDATION_ERROR,
      message: first?.message ?? "Invalid user entry",
      path: first?.path.join("."),
    });
  }
  const entry = parsed.data;

  const mapped = mapEntry({
    entry,
    connection: input.connection,
    provider: input.provider,
  });
  if (!mapped.ok) {
    return errorOutcome(row.seq, mapped.error);
  }

  try {
    const existingId = await findExistingUser(
      data,
      tenantId,
      entry,
      input.provider,
    );

    if (existingId && !input.upsert) {
      return errorOutcome(row.seq, {
        code: IMPORT_ERROR_CODES.USER_ALREADY_EXISTS,
        message: `A user matching ${entry.email} already exists; enable upsert to update it`,
        path: "email",
      });
    }

    if (existingId) {
      const { connection: _connection, ...updatable } = mapped.value.user;
      await data.users.update(tenantId, existingId, updatable);

      // Auth0 only sets a password on initial import, never on an upsert of
      // a user who already has one — so an existing credential is left alone.
      if (mapped.value.password) {
        const current = await data.passwords.get(tenantId, existingId);
        if (!current) {
          await data.passwords.create(tenantId, {
            user_id: existingId,
            is_current: true,
            ...mapped.value.password,
          });
        }
      }

      return { seq: row.seq, status: "updated", entity_id: existingId };
    }

    const created = await data.users.create(tenantId, mapped.value.user);
    if (mapped.value.password) {
      await data.passwords.create(tenantId, {
        user_id: created.user_id,
        is_current: true,
        ...mapped.value.password,
      });
    }
    return { seq: row.seq, status: "inserted", entity_id: created.user_id };
  } catch (error) {
    return errorOutcome(row.seq, {
      code: IMPORT_ERROR_CODES.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Advance a `users_import` operation by processing staged rows until it is
 * finished or the caller's budget runs out.
 *
 * This is the whole execution model. Every engine — an inline kick from the
 * accepting request, a cron sweep, a Cloudflare Workflow step — calls this
 * same function; they differ only in how much budget they pass and how often
 * they call it. Durability comes from the database, not from the caller:
 * outcomes are committed chunk by chunk, so a driver that dies loses at most
 * the chunk in flight, and those rows stay `pending` for whoever runs next.
 */
export async function advanceUsersImport(
  data: DataAdapters,
  operationId: string,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const rowsAdapter = data.tenantOperationRows;
  const operationsAdapter = data.tenantOperations;
  if (!rowsAdapter || !operationsAdapter) {
    throw new Error(
      "Bulk user import requires the tenantOperations and tenantOperationRows adapters",
    );
  }

  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const workerId =
    options.workerId ??
    `import-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

  const operation = await operationsAdapter.get(operationId);
  if (!operation) {
    throw new Error(`Tenant operation ${operationId} not found`);
  }
  if (operation.status === "succeeded" || operation.status === "failed") {
    const counts = await rowsAdapter.countByStatus(operationId);
    return {
      done: true,
      processed: 0,
      remaining: counts.pending,
      claimed: false,
    };
  }

  const claimed = await operationsAdapter.claim(operationId, workerId, leaseMs);
  if (!claimed) {
    const counts = await rowsAdapter.countByStatus(operationId);
    return {
      done: false,
      processed: 0,
      remaining: counts.pending,
      claimed: false,
    };
  }

  const input = parseImportInput(operation);
  if (!input) {
    await operationsAdapter.update(operationId, {
      status: "failed",
      error: "Operation input is missing or malformed",
      finished_at: new Date().toISOString(),
    });
    await operationsAdapter.release(operationId, workerId);
    return { done: true, processed: 0, remaining: 0, claimed: true };
  }

  const tenantId = operation.tenant_id;
  if (!tenantId) {
    await operationsAdapter.update(operationId, {
      status: "failed",
      error: "users_import operations require a tenant_id",
      finished_at: new Date().toISOString(),
    });
    await operationsAdapter.release(operationId, workerId);
    return { done: true, processed: 0, remaining: 0, claimed: true };
  }

  if (operation.status === "pending") {
    await operationsAdapter.update(operationId, { status: "running" });
  }

  let processed = 0;
  const budget = options.maxRows ?? Number.POSITIVE_INFINITY;

  try {
    for (;;) {
      if (processed >= budget) break;
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        break;
      }

      const take = Math.min(chunkSize, budget - processed);
      const pending = await rowsAdapter.claimPending(operationId, take);
      if (pending.length === 0) break;

      const outcomes: TenantOperationRowOutcome[] = [];
      for (const row of pending) {
        outcomes.push(await processRow(data, tenantId, row, input));
      }

      // Commit the whole chunk in one call: an interruption before this
      // point leaves every row in the chunk `pending` and safely repeatable.
      await rowsAdapter.recordOutcomes(operationId, outcomes);
      processed += outcomes.length;

      const counts = await rowsAdapter.countByStatus(operationId);
      await operationsAdapter.update(operationId, {
        current_step: `${counts.total - counts.pending}/${counts.total} rows`,
        result: buildSummary(counts),
      });
    }

    const counts = await rowsAdapter.countByStatus(operationId);
    const done = counts.pending === 0;
    if (done) {
      await operationsAdapter.update(operationId, {
        status: "succeeded",
        current_step: `${counts.total}/${counts.total} rows`,
        result: buildSummary(counts),
        finished_at: new Date().toISOString(),
      });
    }

    return { done, processed, remaining: counts.pending, claimed: true };
  } finally {
    await operationsAdapter.release(operationId, workerId);
  }
}

/** Auth0's job summary shape, derived from the staged-row counts. */
export function buildSummary(counts: {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
}): Record<string, number> {
  return {
    total: counts.total,
    inserted: counts.inserted,
    updated: counts.updated,
    failed: counts.failed,
  };
}

export interface ResumeUsersImportsOptions extends Omit<
  AdvanceOptions,
  "workerId"
> {
  /** Maximum operations to advance in one sweep. */
  maxOperations?: number;
}

export interface ResumeUsersImportsResult {
  scanned: number;
  advanced: number;
  completed: number;
  errors: number;
}

/**
 * Resume every unfinished bulk import that no live driver is working on.
 *
 * This is what makes the feature durable regardless of deployment. Wire it
 * to a scheduled handler alongside `runRetention`: whatever started an
 * import — a request that timed out, a worker that was evicted, a process
 * that was redeployed mid-run — the sweep picks the job back up and carries
 * it to completion from the last committed chunk.
 *
 * One operation's failure never aborts the sweep.
 */
export async function resumeUsersImports(
  data: DataAdapters,
  options: ResumeUsersImportsOptions = {},
): Promise<ResumeUsersImportsResult> {
  const operationsAdapter = data.tenantOperations;
  if (!operationsAdapter || !data.tenantOperationRows) {
    return { scanned: 0, advanced: 0, completed: 0, errors: 0 };
  }

  const operations = await operationsAdapter.listResumable({
    kind: "users_import",
    limit: options.maxOperations ?? 10,
  });

  const result: ResumeUsersImportsResult = {
    scanned: operations.length,
    advanced: 0,
    completed: 0,
    errors: 0,
  };

  for (const operation of operations) {
    try {
      const advanced = await advanceUsersImport(data, operation.id, options);
      if (advanced.processed > 0) result.advanced += 1;
      if (advanced.done) result.completed += 1;
    } catch (error) {
      result.errors += 1;
      console.warn(
        `Failed to resume users_import ${operation.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return result;
}
