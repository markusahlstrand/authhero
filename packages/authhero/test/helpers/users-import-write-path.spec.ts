import { describe, it, expect, vi } from "vitest";
import type { DataAdapters } from "@authhero/adapter-interfaces";
import { advanceUsersImport } from "../../src/helpers/users-import/process";

/**
 * Pins how the import writes a fresh user, at the adapter boundary.
 *
 * The HTTP-level tests cannot see this: the accept request drains the first
 * chunk through its own request-scoped adapter, so instrumenting the server's
 * `env.data` measures an import that has already happened. Driving
 * `advanceUsersImport` directly with a fake adapter set is the only place the
 * calls are observable.
 *
 * Two properties, both of which the batched write introduced and both of which
 * must hold on the per-row fallback as well — otherwise the policy applied to
 * an import file would depend on whether the installed adapter happens to
 * implement `createMany`:
 *
 *  1. A bulk import never goes through the hook-decorated `users.create`. It
 *     uses `rawCreate`, matching Auth0, where a users-import job does not run
 *     Actions.
 *  2. The password is written in the same call as the user, not with a second
 *     `passwords.create` afterwards.
 */

interface FakeOptions {
  /** Make the batched path fail so the per-row fallback runs instead. */
  failBatch?: boolean;
  /** Omit `createMany` entirely, as an adapter that does not implement it. */
  noCreateMany?: boolean;
  rows?: { email: string; password_hash?: string }[];
}

function makeAdapters(options: FakeOptions = {}) {
  const rows = options.rows ?? [{ email: "one@example.com" }];
  const calls = {
    create: 0,
    rawCreate: 0,
    createMany: 0,
    passwordsCreate: 0,
  };
  /** Users written, in the shape they were handed to the adapter. */
  const written: Record<string, unknown>[] = [];

  const staged = rows.map((payload, i) => ({
    operation_id: "op_1",
    seq: i,
    payload,
    status: "pending" as const,
  }));
  let claimedRows = false;

  const data = {
    tenantOperations: {
      get: async () => ({
        id: "op_1",
        tenant_id: "tenantId",
        kind: "users_import",
        status: "pending",
        input: {
          connection_id: "con_1",
          connection: "Username-Password-Authentication",
          provider: "auth0",
          upsert: false,
        },
        created_at: new Date().toISOString(),
      }),
      claim: async () => true,
      release: async () => true,
      update: async () => true,
      listResumable: async () => [],
    },
    tenantOperationRows: {
      countByStatus: async () => ({
        pending: claimedRows ? 0 : staged.length,
        inserted: 0,
        updated: 0,
        failed: 0,
      }),
      claimPending: async () => {
        if (claimedRows) return [];
        claimedRows = true;
        return staged;
      },
      recordOutcomes: async (_id: string, outcomes: unknown[]) =>
        outcomes.length,
    },
    users: {
      get: async () => null,
      list: async () => ({ users: [] }),
      create: async (_t: string, user: Record<string, unknown>) => {
        calls.create += 1;
        written.push(user);
        return { ...user, user_id: user.user_id ?? "auth0|created" };
      },
      rawCreate: async (_t: string, user: Record<string, unknown>) => {
        calls.rawCreate += 1;
        written.push(user);
        return { ...user, user_id: user.user_id ?? "auth0|raw" };
      },
      update: async () => true,
      ...(options.noCreateMany
        ? {}
        : {
            createMany: async (
              _t: string,
              users: Record<string, unknown>[],
            ) => {
              calls.createMany += 1;
              if (options.failBatch) throw new Error("forced batch failure");
              written.push(...users);
              return users;
            },
          }),
    },
    passwords: {
      get: async () => null,
      create: async (_t: string, p: unknown) => {
        calls.passwordsCreate += 1;
        return p;
      },
    },
  } as unknown as DataAdapters;

  return { data, calls, written };
}

describe("users import — how a fresh user is written", () => {
  it("uses rawCreate, never the hook-decorated create, on the batched path", async () => {
    const { data, calls } = makeAdapters();
    await advanceUsersImport(data, "op_1");

    expect(calls.createMany).toBe(1);
    expect(calls.create).toBe(0);
  });

  it("uses rawCreate, never create, on the per-row fallback", async () => {
    const { data, calls } = makeAdapters({ failBatch: true });
    await advanceUsersImport(data, "op_1");

    expect(calls.createMany).toBe(1); // attempted
    expect(calls.rawCreate).toBe(1); // then fell back
    expect(calls.create).toBe(0);
  });

  it("uses rawCreate on an adapter with no createMany at all", async () => {
    const { data, calls } = makeAdapters({ noCreateMany: true });
    await advanceUsersImport(data, "op_1");

    expect(calls.rawCreate).toBe(1);
    expect(calls.create).toBe(0);
  });

  it("carries the password on the user rather than a second write", async () => {
    // A real bcrypt hash: the import rejects anything else.
    const hash =
      "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    const { data, calls, written } = makeAdapters({
      rows: [{ email: "pw@example.com", password_hash: hash }],
    });
    await advanceUsersImport(data, "op_1");

    expect(calls.passwordsCreate).toBe(0);
    expect(written[0]?.password).toEqual({ hash, algorithm: "bcrypt" });
  });

  it("lowercases the email it writes", async () => {
    // addDataHooks normalizes into `create`, which this path no longer uses,
    // so the import has to normalize itself or stored rows would not match the
    // probes that look for them.
    const { data, written } = makeAdapters({
      rows: [{ email: "MiXeD@Example.COM" }],
    });
    await advanceUsersImport(data, "op_1");

    expect(written[0]?.email).toBe("mixed@example.com");
  });
});
