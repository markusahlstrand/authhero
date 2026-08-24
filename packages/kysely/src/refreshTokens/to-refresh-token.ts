import { RefreshToken } from "@authhero/adapter-interfaces";
import { Selectable } from "kysely";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";
import { removeNullProperties } from "../helpers/remove-nulls";

/**
 * Map a `refresh_tokens` row onto the adapter shape.
 *
 * Shared by get / getByLookup / list so the three readers cannot drift — in
 * particular the `auth_strategy` re-nesting, which is stored as two flat
 * columns but exposed as one nested object.
 */
export function toRefreshToken(
  row: Selectable<Database["refresh_tokens"]>,
): RefreshToken {
  const {
    tenant_id: _,
    created_at_ts,
    expires_at_ts,
    idle_expires_at_ts,
    last_exchanged_at_ts,
    revoked_at_ts,
    rotated_at_ts,
    auth_strategy_strategy,
    auth_strategy_strategy_type,
    ...rest
  } = row;

  // Convert dates from DB format (bigint) to ISO strings
  const dates = convertDatesToAdapter(
    {
      created_at_ts,
      expires_at_ts,
      idle_expires_at_ts,
      last_exchanged_at_ts,
      revoked_at_ts,
      rotated_at_ts,
    },
    ["created_at_ts"],
    [
      "expires_at_ts",
      "idle_expires_at_ts",
      "last_exchanged_at_ts",
      "revoked_at_ts",
      "rotated_at_ts",
    ],
  ) as {
    created_at: string;
    expires_at?: string;
    idle_expires_at?: string;
    last_exchanged_at?: string;
    revoked_at?: string;
    rotated_at?: string;
  };

  // Nullable columns come back as SQL NULL; the adapter shape models them as
  // absent optionals, and the management API's response schema rejects null.
  return removeNullProperties({
    ...rest,
    ...dates,
    rotating: !!row.rotating,
    device: row.device ? JSON.parse(row.device) : {},
    resource_servers: row.resource_servers
      ? JSON.parse(row.resource_servers)
      : [],
    // Only surfaced when both halves are set — a half-populated strategy is
    // meaningless, and legacy rows have neither.
    ...(auth_strategy_strategy && auth_strategy_strategy_type
      ? {
          auth_strategy: {
            strategy: auth_strategy_strategy,
            strategy_type: auth_strategy_strategy_type,
          },
        }
      : {}),
  });
}
