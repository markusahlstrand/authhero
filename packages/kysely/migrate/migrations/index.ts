import * as baseline from "./2026-07-16T14:00:00_baseline";
import * as codesExpiresAtTs from "./2026-07-16T15:00:00_codes_expires_at_ts";
import * as scimInboundProvisioning from "./2026-08-04T12:00:00_scim_inbound_provisioning";
import * as userBlocked from "./2026-08-05T12:00:00_user_blocked";
import * as promptSettingsLastUsed from "./2026-08-09T12:00:00_prompt_settings_last_used";
import * as actionExecutionsCreatedAtIndex from "./2026-08-10T12:00:00_action_executions_created_at_index";
import * as pageHooks from "./2026-08-11T12:00:00_page_hooks";
import * as refreshTokenSessionId from "./2026-08-20T12:00:00_refresh_token_session_id";
import * as refreshTokenSessionIdBackfill from "./2026-08-21T12:00:00_refresh_token_session_id_backfill";
import * as tenantOperationRows from "./2026-09-01T12:00:00_tenant_operation_rows";

/**
 * Kysely runs these in key order and refuses to start if an already-executed
 * migration sorts after a pending one, so the keys must sort in execution
 * order. They are the filenames verbatim (ISO-8601 timestamps), which gives
 * that for free and leaves nothing to hand-maintain: the old scheme keyed
 * these `m1_init` / `n01_` / `o083_`, rolling the letter whenever the digits
 * ran out, and had already drifted — two files sat in this directory unimported
 * and therefore never ran.
 *
 * Upstream reaches the same guarantee with kysely's FileMigrationProvider,
 * which we can't use: this package is bundled by vite and published as `dist`
 * only (see package.json `files`), and it runs on Cloudflare Workers, so there
 * is no migrations directory on disk to read at runtime. Static imports are
 * what survive bundling.
 */
export default {
  "2026-07-16T14:00:00_baseline": baseline,
  "2026-07-16T15:00:00_codes_expires_at_ts": codesExpiresAtTs,
  "2026-08-04T12:00:00_scim_inbound_provisioning": scimInboundProvisioning,
  "2026-08-05T12:00:00_user_blocked": userBlocked,
  "2026-08-09T12:00:00_prompt_settings_last_used": promptSettingsLastUsed,
  "2026-08-10T12:00:00_action_executions_created_at_index":
    actionExecutionsCreatedAtIndex,
  "2026-08-11T12:00:00_page_hooks": pageHooks,
  "2026-08-20T12:00:00_refresh_token_session_id": refreshTokenSessionId,
  "2026-08-21T12:00:00_refresh_token_session_id_backfill":
    refreshTokenSessionIdBackfill,
  "2026-09-01T12:00:00_tenant_operation_rows": tenantOperationRows,
};
