import { Kysely } from "kysely";
import { luceneFilter, sanitizeLuceneQuery } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { userToIdentity } from "./user-to-identity";
import { Database } from "../db";
import { ListParams, ListUsersResponse } from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";

// Fields users.list() accepts in `q`. Excludes `tenant_id` so a clause like
// `q=tenant_id:other` cannot cross tenant boundaries; everything else here
// maps to a real column on the users table.
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

// luceneFilter routes bare-string tokens through this list (LIKE search).
// Keep narrow — every column here is publicly searchable via `q`.
const SEARCHABLE_COLUMNS = ["email", "name", "phone_number", "user_id"];

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListUsersResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db.selectFrom("users").where("users.tenant_id", "=", tenantId);
    if (q) {
      // Sanitize first so only whitelisted fields reach luceneFilter;
      // otherwise a clause like `q=tenant_id:other` would emit SQL against
      // arbitrary columns and could cross tenant boundaries.
      const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
      if (sanitized) {
        query = luceneFilter(db, query, sanitized, SEARCHABLE_COLUMNS);
      }
    }

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      query = query.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const users = await filteredQuery.selectAll().execute();

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

    const usersWithProfiles = users.map((user) => {
      const linkedUsersForUser = linkedUsers.filter(
        (u) => u.linked_to === user.user_id,
      );

      return removeNullProperties({
        ...user,
        email_verified: user.email_verified === 1,
        phone_verified:
          user.phone_verified !== null ? user.phone_verified === 1 : undefined,
        is_social: user.is_social === 1,
        app_metadata: JSON.parse(user.app_metadata),
        user_metadata: JSON.parse(user.user_metadata),
        address: user.address ? JSON.parse(user.address) : undefined,
        identities: [
          userToIdentity(user, true),
          ...linkedUsersForUser.map((u) => userToIdentity(u)),
        ],
      });
    });

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
