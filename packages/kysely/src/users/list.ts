import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { userToIdentity } from "./user-to-identity";
import { Database } from "../db";
import {
  ListParams,
  ListUsersResponse,
} from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListUsersResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db.selectFrom("users").where("users.tenant_id", "=", tenantId);
    if (q) {
      // NOTE - this isn't faithful to Auth0 as Auth0 does this in the dashboard - we can filter by any field on the Auth0 mgmt api
      query = luceneFilter(db, query, q, ["email", "name", "phone_number"]);
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
