import {
  DataAdapters,
  SigningKey,
  emailProviderSchema,
  brandingSchema,
  promptSettingSchema,
  listControlPlaneKeys,
} from "authhero";
import {
  DefaultsProjectionEntities,
  DefaultsProjectionResult,
  EntityProjectionOutcome,
  ProjectableDefaults,
  attempt,
  emptyOutcome,
  emptyResult,
  isInheritableHook,
  readControlPlaneDefaults,
  resolveDefaultsEntities,
  writeControlPlaneDefaults,
} from "./defaults-projection";

/**
 * Entity flags for the wire payload — the six default entities plus signing
 * keys and tenant rows, which only flow through the payload (build + apply),
 * never through the in-process `projectControlPlaneDefaults`.
 */
export type DefaultsPayloadEntities = DefaultsProjectionEntities & {
  signingKeys?: boolean;
  /**
   * Seed the FK-target `tenants` rows into the tenant DB before writing the
   * keyed defaults. Defaults to `true`. See {@link ControlPlaneTenantSeed}.
   */
  tenants?: boolean;
};

/**
 * A minimal `tenants` row the payload carries so the tenant DB has the foreign
 * key targets every other write depends on. D1 enforces the
 * `tenant_id -> tenants(id)` FK, so a freshly provisioned tenant DB (which only
 * has the empty `tenants` table the migrations create) rejects every
 * tenant-scoped insert until these rows exist:
 *
 *  1. the **control-plane tenant id** — the projected defaults
 *     (connections / resource servers / hooks / …) are keyed under it; and
 *  2. the **target tenant's own id** — the tenant's own users / connections /
 *     sessions reference it.
 *
 * Deliberately minimal (`id` + `friendly_name`): the FK only needs the row to
 * exist, `friendly_name` is the only required create field, and keeping it
 * minimal avoids shipping control-plane tenant settings/secrets into a tenant
 * DB. Rows are create-if-missing on apply, so a re-sync never clobbers a row a
 * tenant has since edited.
 */
export interface ControlPlaneTenantSeed {
  id: string;
  friendly_name: string;
}

/**
 * Wire shape pushed from a control plane to a tenant database. Transport-
 * agnostic: a Cloudflare dispatch push, an HTTP POST, or an in-process call all
 * carry this same object. Built on the control plane with
 * {@link buildControlPlaneDefaultsPayload} and applied on the tenant with
 * {@link applyControlPlaneDefaultsPayload}.
 */
export interface ControlPlaneDefaultsPayload extends ProjectableDefaults {
  /**
   * Control-plane shared `jwt_signing` keys, PUBLIC material only. Invariant:
   * `pkcs7` (the private key) is stripped on build AND re-stripped on apply, so
   * a private key can never cross the wire or land in a tenant DB. Used to
   * verify tokens the control plane signed (e.g. forwarded admin tokens).
   */
  signingKeys: SigningKey[];
  /**
   * FK-target `tenants` rows upserted into the tenant DB *before* any keyed
   * default, so the `tenant_id -> tenants(id)` FK resolves. See
   * {@link ControlPlaneTenantSeed}.
   */
  tenants: ControlPlaneTenantSeed[];
}

/** Result of applying a payload — the projection result plus the key/tenant outcomes. */
export interface ControlPlaneDefaultsApplyResult extends DefaultsProjectionResult {
  signingKeys: EntityProjectionOutcome;
  tenants: EntityProjectionOutcome;
}

/**
 * Strip a control-plane key down to public, control-plane-scoped material: drop
 * `pkcs7` (private key) and `tenant_id` (so it is stored as a shared key that
 * `listControlPlaneKeys` resolves for verification). Used on both build and
 * apply so the public-only invariant holds end to end.
 *
 * Done by omission rather than schema parse: the keys come straight off a DB
 * adapter that emits `null` for absent optional columns, which the full
 * `signingKeySchema` rejects — and the security invariant we care about is
 * "no private material crosses the boundary", which omission guarantees.
 */
function toPublicControlPlaneKey(key: SigningKey): SigningKey {
  const { pkcs7: _pkcs7, tenant_id: _tenantId, ...publicKey } = key;
  return publicKey;
}

/**
 * Reads the control plane's defaults + public signing keys off a control-plane
 * adapter and filters them down to the inheritable, shareable set — the wire
 * payload. Mirrors what `projectControlPlaneDefaults` writes, minus the write.
 *
 * The signing-key selection reuses authhero's `listControlPlaneKeys`
 * (`-_exists_:tenant_id`) so the public-key query has a single source of truth;
 * this layer only strips `pkcs7`.
 */
export async function buildControlPlaneDefaultsPayload(
  controlPlaneAdapters: DataAdapters,
  controlPlaneTenantId: string,
  entities: DefaultsPayloadEntities = {},
  targetTenantId?: string,
): Promise<ControlPlaneDefaultsPayload> {
  const project = resolveDefaultsEntities(entities);
  const includeSigningKeys = entities.signingKeys ?? true;
  const includeTenants = entities.tenants ?? true;

  const data = await readControlPlaneDefaults(
    controlPlaneAdapters,
    controlPlaneTenantId,
    project,
  );

  const signingKeys = includeSigningKeys
    ? (await listControlPlaneKeys(controlPlaneAdapters.keys)).map(
        toPublicControlPlaneKey,
      )
    : [];

  const tenants = includeTenants
    ? await buildTenantSeeds(
        controlPlaneAdapters,
        controlPlaneTenantId,
        targetTenantId,
      )
    : [];

  return {
    connections: data.connections,
    // Filter to the shareable set on the wire (the write side filters too, so
    // this only keeps the payload minimal).
    resourceServers: data.resourceServers.filter((rs) => rs.is_system),
    hooks: data.hooks.filter(isInheritableHook),
    emailProvider: data.emailProvider,
    branding: data.branding,
    promptSettings: data.promptSettings,
    signingKeys,
    tenants,
  };
}

/**
 * Build the FK-target tenant seeds: always the control-plane tenant row, plus
 * the target tenant's own row when a (distinct) `targetTenantId` is given.
 * `friendly_name` is read off the control-plane DB (which holds every tenant's
 * row) and falls back to the id if the row can't be read.
 */
async function buildTenantSeeds(
  controlPlaneAdapters: DataAdapters,
  controlPlaneTenantId: string,
  targetTenantId?: string,
): Promise<ControlPlaneTenantSeed[]> {
  const ids =
    targetTenantId && targetTenantId !== controlPlaneTenantId
      ? [controlPlaneTenantId, targetTenantId]
      : [controlPlaneTenantId];

  const seeds: ControlPlaneTenantSeed[] = [];
  for (const id of ids) {
    const row = await controlPlaneAdapters.tenants.get(id);
    seeds.push({ id, friendly_name: row?.friendly_name || id });
  }
  return seeds;
}

/**
 * Upserts the public control-plane signing keys into the tenant DB. Keys are
 * stored with NO `tenant_id` (so `listControlPlaneKeys` resolves them) and are
 * create-if-missing by `kid` — rotation mints a new kid, and leaving old public
 * keys behind is harmless. `pkcs7` is re-stripped defensively here too.
 */
async function applyControlPlaneSigningKeys(
  keys: SigningKey[],
  target: DataAdapters,
  continueOnError: boolean,
): Promise<EntityProjectionOutcome> {
  const outcome = emptyOutcome();
  if (keys.length === 0) return outcome;

  // `KeysAdapter` has no get-by-kid, so list the existing control-plane keys
  // once and dedup against their kids.
  const existing = await listControlPlaneKeys(target.keys);
  const existingKids = new Set(existing.map((k) => k.kid));

  for (const key of keys) {
    await attempt(
      outcome,
      `signing_key ${key.kid}`,
      continueOnError,
      async () => {
        const publicKey = toPublicControlPlaneKey(key);
        if (existingKids.has(publicKey.kid)) return; // create-if-missing
        await target.keys.create(publicKey);
        existingKids.add(publicKey.kid);
        outcome.upserted += 1;
      },
    );
  }

  return outcome;
}

/**
 * Upserts the FK-target tenant rows into the tenant DB. Create-if-missing by id
 * (mirroring the signing-key path): a re-sync leaves an already-present row
 * untouched, so a tenant's own later edits to its row are never clobbered. Only
 * `id` + `friendly_name` are written, so a tampered payload can't smuggle extra
 * tenant fields into the DB.
 */
async function applyControlPlaneTenantSeeds(
  seeds: ControlPlaneTenantSeed[],
  target: DataAdapters,
  continueOnError: boolean,
): Promise<EntityProjectionOutcome> {
  const outcome = emptyOutcome();
  for (const seed of seeds) {
    await attempt(outcome, `tenant ${seed.id}`, continueOnError, async () => {
      const existing = await target.tenants.get(seed.id);
      if (existing) return; // create-if-missing
      await target.tenants.create({
        id: seed.id,
        friendly_name: seed.friendly_name,
      });
      outcome.upserted += 1;
    });
  }
  return outcome;
}

/**
 * Applies a control-plane defaults payload to a tenant's own adapter, writing
 * the rows under `controlPlaneTenantId` so the runtime fallback resolves them
 * locally. Reuses the same upsert/filter path as `projectControlPlaneDefaults`
 * (via `writeControlPlaneDefaults`) and adds the dedicated signing-key path.
 *
 * The payload is a trust boundary: every singleton is re-parsed with its schema
 * and signing keys are re-stripped of `pkcs7` before anything is written.
 *
 * `result.tenantId` is the control-plane tenant id the rows are keyed under
 * (the target adapter already _is_ the tenant's database).
 */
export async function applyControlPlaneDefaultsPayload(
  payload: ControlPlaneDefaultsPayload,
  targetAdapters: DataAdapters,
  controlPlaneTenantId: string,
  options: {
    continueOnError?: boolean;
    entities?: DefaultsPayloadEntities;
  } = {},
): Promise<ControlPlaneDefaultsApplyResult> {
  const continueOnError = options.continueOnError ?? false;
  const project = resolveDefaultsEntities(options.entities);
  const includeSigningKeys = options.entities?.signingKeys ?? true;
  const includeTenants = options.entities?.tenants ?? true;

  // Re-validate the payload at the trust boundary. Connections / resource
  // servers / hooks are parsed inside writeControlPlaneDefaults via their insert
  // schemas; the singletons are parsed here.
  const data: ProjectableDefaults = {
    connections: payload.connections,
    resourceServers: payload.resourceServers,
    hooks: payload.hooks,
    emailProvider: payload.emailProvider
      ? emailProviderSchema.parse(payload.emailProvider)
      : null,
    branding: payload.branding ? brandingSchema.parse(payload.branding) : null,
    promptSettings: payload.promptSettings
      ? promptSettingSchema.parse(payload.promptSettings)
      : null,
  };

  // Seed the FK-target tenant rows FIRST — every keyed default below references
  // `tenants(id)`, so without these rows the upserts FK-fail (silently, when
  // continueOnError is set).
  const tenants = includeTenants
    ? await applyControlPlaneTenantSeeds(
        payload.tenants ?? [],
        targetAdapters,
        continueOnError,
      )
    : emptyOutcome();

  const result = emptyResult(controlPlaneTenantId);
  await writeControlPlaneDefaults(
    data,
    targetAdapters,
    controlPlaneTenantId,
    project,
    continueOnError,
    result,
  );

  const signingKeys = includeSigningKeys
    ? await applyControlPlaneSigningKeys(
        payload.signingKeys,
        targetAdapters,
        continueOnError,
      )
    : emptyOutcome();

  return { ...result, signingKeys, tenants };
}
