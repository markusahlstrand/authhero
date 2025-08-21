import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams, SigningKey, Totals } from "@authhero/adapter-interfaces";
import { luceneFilter } from "../helpers/filter";
import getCountAsInt from "../utils/getCountAsInt";

interface ListKeysResponse extends Totals {
  signingKeys: SigningKey[];
}

export function list(db: Kysely<Database>) {
  return async (params: ListParams = {}): Promise<ListKeysResponse> => {
    const {
      page = 0,
      per_page = 100,
      include_totals = false,
      sort,
      q,
    } = params;
    let query = db
      .selectFrom("keys")
      .where((eb) =>
        eb.or([
          eb("revoked_at", ">", new Date().toISOString()),
          eb("revoked_at", "is", null),
        ]),
      );

    // Apply search filter if provided
    if (q) {
      query = luceneFilter(db, query, q, [
        "kid",
        "connection",
        "fingerprint",
        "thumbprint",
        "type",
      ]);
    }

    let countQuery = query.select((eb) => eb.fn.count("kid").as("count"));

    const offset = page * per_page;

    query = query.limit(per_page).offset(offset);

    // Add sorting if specified
    if (sort) {
      query = query.orderBy(sort.sort_by as any, sort.sort_order);
    }

    const keys = await query.selectAll().execute();

    if (!include_totals) {
      return {
        signingKeys: keys,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const countResult = await countQuery.executeTakeFirst();
    const total = getCountAsInt(countResult?.count ?? 0);

    return {
      signingKeys: keys,
      start: offset,
      limit: per_page,
      length: total,
    };
  };
}
