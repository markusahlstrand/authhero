import * as baseline from "./2026-07-16T14:00:00_baseline";
import * as codesExpiresAtTs from "./2026-07-16T15:00:00_codes_expires_at_ts";
import * as restoreUniquePhoneProvider from "./2026-07-16T16:00:00_restore_unique_phone_provider";

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
  "2026-07-16T16:00:00_restore_unique_phone_provider":
    restoreUniquePhoneProvider,
};
