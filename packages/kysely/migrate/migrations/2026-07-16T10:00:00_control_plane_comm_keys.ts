import { Kysely } from "kysely";

/**
 * Registry of per-tenant control-plane-communication PUBLIC keys (issue #1139).
 *
 * Each WFP tenant shard is provisioned a dedicated keypair: the private half
 * becomes the shard's `CONTROL_PLANE_COMM_KEY` secret and signs only its
 * write-through calls (custom domains, tenant members) — never the tenant's
 * user tokens. The public half lives here so the control plane's verifier
 * resolves it locally, with no reach back to the shard.
 *
 * A table rather than KV: the control plane must verify a shard's token
 * immediately after provisioning, and an eventually-consistent store yields
 * transient `unknown kid` failures inside the propagation window.
 *
 * `kid` is the primary key — verification resolves a key by `kid` and rotation
 * mints a new one, so several live rows per tenant are expected (a token signed
 * with the prior key must still verify during a swap).
 *
 * No FK to `tenants`, for the same reason as `tenant_operations`: cleanup is a
 * deprovision concern, and an orphaned public key is inert — it can only verify
 * a token whose private half nothing holds.
 *
 * `public_jwk` holds the full JWK JSON including `kid` + `alg`
 * (`crypto.subtle.exportKey("jwk")` omits both, so the producer must stamp
 * them; the verifier matches on `kid` and rejects on `alg` mismatch).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("control_plane_comm_keys")
    .ifNotExists()
    .addColumn("kid", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("public_jwk", "text", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(35)")
    .execute();

  // The verify path selects a tenant's non-revoked keys, newest first.
  await db.schema
    .createIndex("control_plane_comm_keys_tenant_id_created_at_idx")
    .on("control_plane_comm_keys")
    .columns(["tenant_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("control_plane_comm_keys").ifExists().execute();
}
