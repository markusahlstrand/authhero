import { Kysely, Selectable } from "kysely";
import { HTTPException } from "hono/http-exception";
import {
  luceneFilter,
  sanitizeLuceneQuery,
  coalescedRef,
  FieldMapping,
} from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { userToIdentity } from "./user-to-identity";
import { Database } from "../db";
import {
  ListParams,
  ListUsersResponse,
  User,
} from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";
import { isKeysetRequest, keysetPaginate } from "../helpers/paginate";

// Fields users.list() accepts in `q`. Excludes `tenant_id` so a clause like
// `q=tenant_id:other` cannot cross tenant boundaries; everything else here
// maps to a real column on the users or user_activity table.
const ALLOWED_Q_FIELDS = [
  "user_id",
  "email",
  "email_verified",
  "username",
  "phone_number",
  "phone_verified",
  "name",
  "given_name",
  "family_name",
  "nickname",
  "picture",
  "locale",
  "linked_to",
  "provider",
  "connection",
  "is_social",
  "last_ip",
  "last_login",
  "login_count",
  "created_at",
  "updated_at",
];

// Activity counters live in the joined user_activity table (issue #1003);
// everything else resolves against users. Shared column names (user_id) make
// unqualified refs ambiguous after the join, so every field is qualified.
const ACTIVITY_FIELDS = new Set(["last_login", "last_ip", "login_count"]);

const FIELD_MAP: Record<string, FieldMapping> = Object.fromEntries(
  ALLOWED_Q_FIELDS.map((field): [string, FieldMapping] => [
    field,
    field === "login_count"
      ? // list/get present a missing activity row as login_count 0, so
        // filters and sorts must treat NULL as 0 too — otherwise
        // `q=login_count:0` would skip users who never logged in.
        { column: "user_activity.login_count", defaultValue: 0 }
      : ACTIVITY_FIELDS.has(field)
        ? `user_activity.${field}`
        : `users.${field}`,
  ]),
);

// luceneFilter routes bare-string tokens through this list (LIKE search).
// Keep narrow — every column here is publicly searchable via `q`.
const SEARCHABLE_COLUMNS = ["email", "name", "phone_number", "user_id"];

// Row shape shared by the offset and keyset branches: every users column plus
// the activity counters selected from the 1:1 left-joined user_activity table.
type UserRow = Selectable<Database["users"]> & {
  last_login: string | null;
  last_ip: string | null;
  login_count: number | null;
};

// Fetch each primary user's linked accounts and fold them into identities.
async function hydrateProfiles(
  db: Kysely<Database>,
  tenantId: string,
  users: UserRow[],
): Promise<User[]> {
  const userIds = users.map((u) => u.user_id);

  // TODO: execute these in parallel with a join
  const linkedUsers = !userIds.length
    ? []
    : await db
        .selectFrom("users")
        .selectAll()
        .where("users.tenant_id", "=", tenantId)
        .where("users.linked_to", "in", userIds)
        .orderBy("created_at", "asc")
        .execute();

  return users.map((user) => {
    const linkedUsersForUser = linkedUsers.filter(
      (u) => u.linked_to === user.user_id,
    );

    return removeNullProperties<User>({
      ...user,
      email_verified: user.email_verified === 1,
      phone_verified:
        user.phone_verified !== null ? user.phone_verified === 1 : undefined,
      is_social: user.is_social === 1,
      login_count: user.login_count ?? 0,
      app_metadata: JSON.parse(user.app_metadata),
      user_metadata: JSON.parse(user.user_metadata),
      address: user.address ? JSON.parse(user.address) : undefined,
      identities: [
        userToIdentity(user, true),
        ...linkedUsersForUser.map((u) => userToIdentity(u)),
      ],
    });
  });
}

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListUsersResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db
      .selectFrom("users")
      // 1:1 join (user_activity PK is tenant_id+user_id), so no row fanout.
      // A missing row means the user never logged in.
      .leftJoin("user_activity", (join) =>
        join
          .onRef("user_activity.tenant_id", "=", "users.tenant_id")
          .onRef("user_activity.user_id", "=", "users.user_id"),
      )
      .where("users.tenant_id", "=", tenantId);
    if (q) {
      // Sanitize first so only whitelisted fields reach luceneFilter;
      // otherwise a clause like `q=tenant_id:other` would emit SQL against
      // arbitrary columns and could cross tenant boundaries.
      const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
      if (sanitized) {
        query = luceneFilter(
          db,
          query,
          sanitized,
          SEARCHABLE_COLUMNS,
          [],
          FIELD_MAP,
        );
      }
    }

    // Keyset (checkpoint) pagination: from/take. Auth0 does not offer
    // checkpoint on /users at all (offset there is capped at 1000 results);
    // this is a deliberate superset so full-tenant walks don't need export
    // jobs. `q` stays in effect inside cursor walks. Only created_at is
    // keyset-sortable (asc/desc); user_id is the unique tiebreaker.
    if (isKeysetRequest(params)) {
      if (sort?.sort_by && sort.sort_by !== "created_at") {
        throw new HTTPException(400, {
          message: `Sorting by ${sort.sort_by} is not supported with checkpoint pagination (from/take); only created_at is`,
        });
      }
      const sortOrder: "asc" | "desc" =
        sort?.sort_order === "asc" ? "asc" : "desc";
      const { rows, limit, next } = await keysetPaginate(
        query
          .selectAll("users")
          .select([
            "user_activity.last_login",
            "user_activity.last_ip",
            "user_activity.login_count",
          ]),
        params,
        {
          // Qualified refs: user_activity also has a user_id column, so a
          // bare user_id ref would be ambiguous after the join.
          sortColumn: "users.created_at",
          sortOrder,
          idColumn: "users.user_id",
          sortKey: `created_at:${sortOrder}`,
        },
      );
      const usersWithProfiles = await hydrateProfiles(db, tenantId, rows);
      return {
        users: usersWithProfiles,
        start: 0,
        limit,
        length: usersWithProfiles.length,
        next,
      };
    }

    // Only sort on a known field. An unmapped sort_by (e.g. `sort=id:1`, where
    // `id` isn't a users column) must be ignored rather than passed through to
    // SQL — an unqualified `order by id` is rejected by MySQL/Vitess as an
    // unknown column once user_activity is joined. Mirrors the drizzle adapter.
    if (sort && sort.sort_by) {
      const mapped = FIELD_MAP[sort.sort_by];
      if (mapped) {
        const { ref } = db.dynamic;
        query = query.orderBy(
          typeof mapped === "string" ? ref(mapped) : coalescedRef(mapped),
          sort.sort_order,
        );
      }
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const users = await filteredQuery
      .selectAll("users")
      .select([
        "user_activity.last_login",
        "user_activity.last_ip",
        "user_activity.login_count",
      ])
      .execute();

    const usersWithProfiles = await hydrateProfiles(db, tenantId, users);

    if (!include_totals) {
      return {
        users: usersWithProfiles,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      users: usersWithProfiles,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
