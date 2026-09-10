import type {
  DataAdapters,
  TenantOperation,
  TenantOperationRow,
  TenantOperationRowOutcome,
} from "@authhero/adapter-interfaces";
import { escapeLuceneValue } from "@authhero/adapter-interfaces";
import { withNormalizedEmail } from "../../utils/email";
import {
  userImportEntrySchema,
  type UserImportEntry,
} from "../../types/auth0/UserImport";
import {
  buildUserId,
  deriveImportUserId,
  IMPORT_ERROR_CODES,
  mapEntry,
  identityKey,
  type IdentityField,
  type ImportRowError,
  type MappedEntry,
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
  const result = await data.users.list(tenantId, {
    // escapeLuceneValue escapes backslashes as well as quotes, and returns the
    // value already quoted. Escaping only quotes is not enough: a value ending
    // in a backslash leaves an even number of them, the closing quote is taken
    // as literal, and the rest of the value becomes query syntax.
    q: `${field}:${escapeLuceneValue(value)}`,
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
 * How many distinct values go into one batched existence probe.
 *
 * The probe is an OR over a single column, which MySQL resolves as a range
 * scan on that column's index — unlike an OR across two columns, which it
 * refuses to index_merge. Keeping each probe to one field is therefore what
 * makes this fast; the cap only bounds the generated query string.
 */
const PROBE_BATCH = 100;

/**
 * Rows read per probe page.
 *
 * A probe cannot ask for one row per requested value: none of these fields is
 * unique on its own — email and username are unique only together with the
 * provider, and phone_number is not unique at all — so several rows can come
 * back for one value and fill a page sized to the value count, hiding a match
 * for a later value and letting an existing user be classified as new. Pages
 * are therefore read until every value has an answer or the matches run out.
 */
const PROBE_PAGE_SIZE = 200;

/**
 * Bound on pages read per probe slice, so a value matching an unbounded number
 * of rows (a shared phone number) cannot turn one chunk into a table scan. The
 * unresolved values simply fall back to being treated as new, which the unique
 * constraint and the per-row retry still catch.
 */
const PROBE_MAX_PAGES = 10;

/** Look up many values of one field in as few queries as the cap allows. */
async function probeField(
  data: DataAdapters,
  tenantId: string,
  field: IdentityField,
  values: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unique = [...new Set(values)];

  for (let i = 0; i < unique.length; i += PROBE_BATCH) {
    const slice = unique.slice(i, i + PROBE_BATCH);
    const wanted = new Set(slice.map((v) => identityKey(field, v)));
    const q = slice.map((v) => `${field}:${escapeLuceneValue(v)}`).join(" OR ");

    for (let page = 0; page < PROBE_MAX_PAGES; page += 1) {
      const result = await data.users.list(tenantId, {
        q,
        page,
        per_page: PROBE_PAGE_SIZE,
        include_totals: false,
      });
      for (const user of result.users) {
        const stored = (user as unknown as Record<string, unknown>)[field];
        if (typeof stored === "string") {
          const key = identityKey(field, stored);
          if (!found.has(key)) found.set(key, user.user_id);
          wanted.delete(key);
        }
      }
      // Stop as soon as every value in the slice has an answer, or the page
      // came back short — either way there is nothing more to learn.
      if (wanted.size === 0 || result.users.length < PROBE_PAGE_SIZE) break;
    }
  }

  return found;
}

/**
 * The insert a fresh row writes, identical on the batched and per-row paths.
 *
 * `addDataHooks` normalizes email into `users.create` but decorates neither
 * `rawCreate` nor `createMany`, so the import does it here — otherwise rows
 * would be stored with the file's casing while every lookup normalizes, and
 * the probe that is supposed to find them would not.
 *
 * The password rides on the user rather than being written afterwards: both
 * `rawCreate` and `createMany` commit it in the same transaction as the user
 * row, so an interrupted driver can no longer leave an imported user who
 * cannot log in.
 */
function freshInsert(mapped: MappedEntry) {
  return withNormalizedEmail({
    ...mapped.user,
    // MappedPassword is {password, algorithm}; UserInsert wants
    // {hash, algorithm} for the atomic user+password write.
    ...(mapped.password
      ? {
          password: {
            hash: mapped.password.password,
            algorithm: mapped.password.algorithm,
          },
        }
      : {}),
  });
}

interface PreparedRow {
  row: TenantOperationRow;
  /** Set when the row failed before any lookup — validation or mapping. */
  outcome?: TenantOperationRowOutcome;
  entry?: UserImportEntry;
  mapped?: MappedEntry;
  /** The id this row would be written under, for the own-prior-write probe. */
  probeId?: string;
  existingId?: string | null;
}

/**
 * Process a whole chunk, trading per-row round-trips for batched ones.
 *
 * The naive shape — probe, insert user, insert password, per row — costs about
 * four sequential queries per row, which on a hosted database is ~400 ms of
 * pure latency each and makes a large migration take days. Here the chunk is
 * parsed and mapped in memory, every existence probe for a given field runs as
 * one query, and the rows that turn out to be new users are written with a
 * single batched insert. A 50-row chunk goes from ~200 queries to about five.
 *
 * Rows needing an update (upsert), rows resuming their own interrupted write,
 * and rows that hit any batch failure fall back to `writeRow` individually, so
 * every outcome the ledger records is still attributed to its own row.
 */
async function processChunk(
  data: DataAdapters,
  tenantId: string,
  rows: TenantOperationRow[],
  input: UsersImportInput,
): Promise<TenantOperationRowOutcome[]> {
  // 1. Parse and map. Pure except for the derived id, which is a local digest.
  const prepared: PreparedRow[] = await Promise.all(
    rows.map(async (row): Promise<PreparedRow> => {
      const parsed = userImportEntrySchema.safeParse(row.payload);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return {
          row,
          outcome: errorOutcome(row.seq, {
            code: IMPORT_ERROR_CODES.VALIDATION_ERROR,
            message: first?.message ?? "Invalid user entry",
            path: first?.path.join("."),
          }),
        };
      }
      const entry = parsed.data;
      const mapped = mapEntry({
        entry,
        connection: input.connection,
        provider: input.provider,
        fallbackUserId: await deriveImportUserId(row.operation_id, row.seq),
      });
      if (!mapped.ok) {
        return { row, outcome: errorOutcome(row.seq, mapped.error) };
      }
      return {
        row,
        entry,
        mapped: mapped.value,
        probeId:
          entry.user_id !== undefined
            ? buildUserId(entry.user_id, input.provider)
            : undefined,
      };
    }),
  );

  const live = prepared.filter((p) => !p.outcome && p.entry && p.mapped);

  const outcomes = new Map<number, TenantOperationRowOutcome>();
  for (const p of prepared) {
    if (p.outcome) outcomes.set(p.row.seq, p.outcome);
  }
  const collect = () =>
    rows.map(
      (row) =>
        outcomes.get(row.seq) ?? {
          seq: row.seq,
          status: "failed" as const,
          error_code: IMPORT_ERROR_CODES.INTERNAL_ERROR,
          error_message: "Row produced no outcome",
        },
    );

  // 1b. An upsert job resolves identity per row and never batches. Its writes
  //     change rows that a later row in the same chunk may itself match, so a
  //     snapshot taken once for the whole chunk is not equivalent to the
  //     sequential loop: a row that renames an existing user's username would
  //     leave a later row still pointing at that user, updating it twice
  //     instead of creating its own. Re-probing per row costs what the old
  //     loop cost, and a bulk migration is overwhelmingly `upsert: false`.
  if (input.upsert) {
    for (const p of live) {
      outcomes.set(
        p.row.seq,
        await writeRow(
          data,
          tenantId,
          p.row,
          input,
          p.entry!,
          p.mapped!,
          await findExistingUser(data, tenantId, p.entry!, input.provider),
        ),
      );
    }
    return collect();
  }

  // 2. One probe per field, matching findExistingUser's precedence. The
  //    derived id is probed too: an existing user carrying it can only be this
  //    row's own earlier write, which writeRow treats as a resume rather than
  //    a conflict.
  const ids = live.flatMap((p) =>
    [p.probeId, p.mapped!.user.user_id].filter((v): v is string => !!v),
  );
  const emails = live.map((p) => p.entry!.email).filter(Boolean);
  const usernames = live
    .map((p) => p.entry!.username)
    .filter((v): v is string => v !== undefined);
  const phones = live
    .map((p) => p.entry!.phone_number)
    .filter((v): v is string => v !== undefined);

  const [byId, byEmail, byUsername, byPhone] = await Promise.all([
    ids.length ? probeField(data, tenantId, "user_id", ids) : new Map(),
    emails.length ? probeField(data, tenantId, "email", emails) : new Map(),
    usernames.length
      ? probeField(data, tenantId, "username", usernames)
      : new Map(),
    phones.length
      ? probeField(data, tenantId, "phone_number", phones)
      : new Map(),
  ]);

  // 3. Resolve each row's identity, in findExistingUser's order.
  //    `seen` de-duplicates within the chunk: two rows sharing an email would
  //    both probe "absent" and both insert, which is the duplicate the
  //    row-at-a-time loop avoided only by being sequential.
  const seen = new Map<string, string>();
  for (const p of live) {
    const entry = p.entry!;
    // Namespaced so a username can never collide with an email of the same
    // text, and covering every field the probes cover: a chunk carrying two
    // rows that share a username (or a phone number) is the same duplicate
    // the sequential loop caught by re-probing after each write.
    const localKeys = [
      `email:${identityKey("email", entry.email)}`,
      ...(entry.username !== undefined
        ? [`username:${identityKey("username", entry.username)}`]
        : []),
      ...(entry.phone_number !== undefined
        ? [`phone_number:${identityKey("phone_number", entry.phone_number)}`]
        : []),
    ];
    p.existingId =
      (p.probeId ? byId.get(identityKey("user_id", p.probeId)) : undefined) ??
      byId.get(identityKey("user_id", p.mapped!.user.user_id!)) ??
      byEmail.get(identityKey("email", entry.email)) ??
      (entry.username !== undefined
        ? byUsername.get(identityKey("username", entry.username))
        : undefined) ??
      (entry.phone_number !== undefined
        ? byPhone.get(identityKey("phone_number", entry.phone_number))
        : undefined) ??
      localKeys.map((k) => seen.get(k)).find((v) => v !== undefined) ??
      null;
    if (p.existingId === null) {
      for (const key of localKeys) seen.set(key, p.mapped!.user.user_id!);
    }
  }

  // 4. New users are the batchable case; everything else keeps the per-row
  //    path, which is where upsert and resume semantics live.
  const fresh = live.filter((p) => p.existingId === null);
  const rest = live.filter((p) => p.existingId !== null);

  if (fresh.length) {
    const inserts = fresh.map((p) => freshInsert(p.mapped!));

    let batched = false;
    if (data.users.createMany) {
      try {
        await data.users.createMany(tenantId, inserts);
        batched = true;
      } catch {
        // A batch is all-or-nothing and cannot say which row collided, so on
        // any failure re-run the whole set individually and let each row
        // record its own outcome. Slower, but only for the failing chunk.
        batched = false;
      }
    }

    if (batched) {
      for (const p of fresh) {
        outcomes.set(p.row.seq, {
          seq: p.row.seq,
          status: "inserted",
          entity_id: p.mapped!.user.user_id,
        });
      }
    } else {
      for (const p of fresh) {
        outcomes.set(
          p.row.seq,
          await writeRow(
            data,
            tenantId,
            p.row,
            input,
            p.entry!,
            p.mapped!,
            // Re-probe rather than trusting the batch's view: the batch may
            // have partially applied before failing.
            await findExistingUser(data, tenantId, p.entry!, input.provider),
          ),
        );
      }
    }
  }

  for (const p of rest) {
    outcomes.set(
      p.row.seq,
      await writeRow(
        data,
        tenantId,
        p.row,
        input,
        p.entry!,
        p.mapped!,
        p.existingId!,
      ),
    );
  }

  return collect();
}

/**
 * The write half of a row, with its identity already resolved.
 *
 * Split out so the batched chunk path can reuse exactly these branches after
 * doing the probe in bulk — the conflict, upsert and resume rules live here
 * once rather than in two places that could disagree.
 */
async function writeRow(
  data: DataAdapters,
  tenantId: string,
  row: TenantOperationRow,
  input: UsersImportInput,
  entry: UserImportEntry,
  mappedValue: MappedEntry,
  existingId: string | null,
): Promise<TenantOperationRowOutcome> {
  const mapped = { value: mappedValue };
  try {
    // A row is reprocessed whenever its driver died between writing the user
    // and committing the outcome. Because the id is derived from
    // (operation_id, seq), an existing user carrying exactly that id can only
    // be this row's own earlier write — so report the import that actually
    // happened instead of a spurious conflict.
    const ownPriorWrite = existingId === mapped.value.user.user_id;

    if (existingId && !input.upsert && !ownPriorWrite) {
      return errorOutcome(row.seq, {
        code: IMPORT_ERROR_CODES.USER_ALREADY_EXISTS,
        message: `A user matching ${entry.email} already exists; enable upsert to update it`,
        path: "email",
      });
    }

    if (existingId && ownPriorWrite) {
      // Finish what the interrupted attempt started: the user row exists, but
      // its password may not have been written before the crash.
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
      return { seq: row.seq, status: "inserted", entity_id: existingId };
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

    // `rawCreate`, not `create`: a bulk import does not run the registration
    // hooks, matching Auth0, where a users-import job does not trigger Actions.
    // This path is also the fallback for a failed batch, and `createMany` is
    // undecorated — routing one through the hook layer and the other around it
    // would make policy enforcement depend on which adapter is installed.
    const created = await data.users.rawCreate(
      tenantId,
      freshInsert(mapped.value),
    );
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
  // Tracks that each chunk actually drains the pending queue; see the
  // no-progress guard at the end of the loop. Seeded from a real count so
  // even the FIRST chunk is checked — otherwise a stalled job would always
  // reprocess one chunk before stopping.
  let pendingBefore = (await rowsAdapter.countByStatus(operationId)).pending;

  try {
    for (;;) {
      if (processed >= budget) break;
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        break;
      }

      const take = Math.min(chunkSize, budget - processed);
      const pending = await rowsAdapter.claimPending(operationId, take);
      if (pending.length === 0) break;

      const outcomes = await processChunk(data, tenantId, pending, input);

      // Commit the whole chunk in one call: an interruption before this
      // point leaves every row in the chunk `pending` and safely repeatable.
      // Count what was actually committed, not what was attempted: a commit
      // that moved no rows is not progress, and reporting it as such would
      // make the resume sweep believe a stalled job is advancing.
      processed += await rowsAdapter.recordOutcomes(operationId, outcomes);

      const counts = await rowsAdapter.countByStatus(operationId);
      await operationsAdapter.update(operationId, {
        current_step: `${counts.total - counts.pending}/${counts.total} rows`,
        result: buildSummary(counts),
      });

      // Safety valve. `claimPending` selects on `status = 'pending'`, so if a
      // commit ever fails to move its rows out of that state the same chunk
      // would be handed back forever — an unbounded loop that re-applies the
      // same writes. Bail out instead and leave the operation for the next
      // driver, which is safe because nothing here is half-committed.
      if (counts.pending >= pendingBefore) {
        console.warn(
          `users_import ${operationId} made no progress on a chunk of ${outcomes.length} rows (${counts.pending} still pending); stopping this pass`,
        );
        break;
      }
      pendingBefore = counts.pending;
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
