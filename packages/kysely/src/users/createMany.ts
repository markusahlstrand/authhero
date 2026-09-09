import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { User, UserInsert, WriteOptions } from "@authhero/adapter-interfaces";

/**
 * Rows per INSERT statement.
 *
 * The point of this adapter is to trade round-trips for statement size, so the
 * number wants to be large — but not unbounded: every row carries JSON blobs
 * (app_metadata, user_metadata, address) and MySQL rejects a statement over
 * max_allowed_packet. 500 keeps a typical import statement comfortably inside
 * the default 4 MB while still cutting a 1,000-user chunk from 1,000
 * round-trips to two.
 */
const INSERT_CHUNK_SIZE = 500;

/**
 * Fields `create` supports that a batch deliberately does not. Writing them
 * needs a per-row side-insert, which would put the round-trips straight back.
 */
function usesUnbatchableFields(user: UserInsert): boolean {
  const u = user as UserInsert & {
    identities?: unknown;
    last_login?: unknown;
    last_ip?: unknown;
    login_count?: unknown;
  };
  return (
    u.identities !== undefined ||
    u.last_login !== undefined ||
    u.last_ip !== undefined ||
    u.login_count !== undefined
  );
}

export function createMany(db: Kysely<Database>) {
  return async (
    tenantId: string,
    users: UserInsert[],
    options?: WriteOptions,
  ): Promise<User[]> => {
    if (users.length === 0) return [];

    // This function never writes the outbox, so accepting events here would
    // report success while silently dropping the caller's audit trail.
    if (options?.outboxEvents?.length) {
      throw new HTTPException(400, {
        message:
          "createMany does not persist outbox events; use create for those users",
      });
    }

    const rejected = users.find(usesUnbatchableFields);
    if (rejected) {
      throw new HTTPException(400, {
        message:
          "createMany does not write identities or activity counters; use create for those users",
      });
    }

    const now = new Date().toISOString();

    const prepared = users.map((user) => {
      const {
        identities: _identities,
        phone_verified,
        password,
        last_login: _last_login,
        last_ip: _last_ip,
        login_count: _login_count,
        ...rest
      } = user as User & Pick<UserInsert, "password">;

      const sqlUser = {
        ...rest,
        created_at: rest.created_at ?? now,
        updated_at: rest.updated_at ?? now,
        user_id: rest.user_id,
        tenant_id: tenantId,
        email_verified: user.email_verified ? 1 : 0,
        phone_verified:
          phone_verified !== undefined ? (phone_verified ? 1 : 0) : null,
        is_social: user.is_social ? 1 : 0,
        blocked: user.blocked ? 1 : 0,
        app_metadata: JSON.stringify(user.app_metadata),
        user_metadata: JSON.stringify(user.user_metadata),
        address: user.address ? JSON.stringify(user.address) : null,
      };

      const passwordRecord =
        password && sqlUser.user_id
          ? {
              id: nanoid(),
              user_id: sqlUser.user_id,
              password: password.hash,
              algorithm: password.algorithm as "bcrypt" | "argon2id",
              is_current: 1 as const,
              created_at: now,
              updated_at: now,
              tenant_id: tenantId,
            }
          : undefined;

      return { sqlUser, passwordRecord };
    });

    const userRows = prepared.map((p) => p.sqlUser);
    const passwordRows = prepared
      .map((p) => p.passwordRecord)
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const execute = async (trx: Kysely<Database>) => {
      for (let i = 0; i < userRows.length; i += INSERT_CHUNK_SIZE) {
        await trx
          .insertInto("users")
          .values(userRows.slice(i, i + INSERT_CHUNK_SIZE))
          .execute();
      }
      for (let i = 0; i < passwordRows.length; i += INSERT_CHUNK_SIZE) {
        await trx
          .insertInto("passwords")
          .values(passwordRows.slice(i, i + INSERT_CHUNK_SIZE))
          .execute();
      }
    };

    try {
      // One transaction for the whole batch: a partial batch would leave users
      // without their passwords, and the caller's row ledger would have no way
      // to tell which half landed.
      if (db.isTransaction) {
        await execute(db);
      } else {
        await db.transaction().execute(execute);
      }
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        code === "ER_DUP_ENTRY" ||
        message.includes("AlreadyExists")
      ) {
        // Deliberately the same 409 `create` raises. The batch caller cannot
        // tell which row collided, so it is expected to retry row-by-row and
        // let `create` attribute the conflict.
        throw new HTTPException(409, { message: "User already exists" });
      }
      throw new HTTPException(500, { message: `${String(code)}, ${message}` });
    }

    return prepared.map(({ sqlUser }) => ({
      ...sqlUser,
      login_count: 0,
      email_verified: !!sqlUser.email_verified,
      is_social: !!sqlUser.is_social,
      blocked: !!sqlUser.blocked,
      phone_verified:
        sqlUser.phone_verified === null ? undefined : !!sqlUser.phone_verified,
      app_metadata: JSON.parse(sqlUser.app_metadata),
      user_metadata: JSON.parse(sqlUser.user_metadata),
      address: sqlUser.address ? JSON.parse(sqlUser.address) : undefined,
    })) as unknown as User[];
  };
}
