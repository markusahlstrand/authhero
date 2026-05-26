import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Add `is_system` and `inherit` flags to `actions`.
 *
 *   - `is_system = 1` marks an action on the control-plane tenant as a
 *     shared template that other tenants can opt into.
 *   - `inherit = 1` on a non-control-plane tenant's action row turns it
 *     into a stub: at execute time the code-hook loader reads `code` from
 *     the control-plane system action whose `name` matches this row's
 *     `name`. Local `secrets` still apply on top (local-first then
 *     upstream-fallback) so customers can configure per-tenant credentials
 *     without forking the code.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
