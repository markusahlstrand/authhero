import {
  DataAdapters,
  Connection,
  ResourceServer,
  Hook,
  connectionInsertSchema,
  resourceServerInsertSchema,
  hookInsertSchema,
  fetchAll,
} from "authhero";

/**
 * Which control plane entities to project into a tenant's own database. Every
 * entity defaults to `true`.
 *
 * The projected rows are the same set the runtime fallback
 * (`withRuntimeFallback`) reads from the control plane tenant: connections,
 * `is_system` resource servers, `inheritable` hooks and the email provider.
 * `branding` and `promptSettings` are projected too so a WFP tenant can render
 * the control plane's defaults; consuming them on read still depends on the
 * tenant resolving those singletons against the control plane tenant id.
 */
export interface DefaultsProjectionEntities {
  connections?: boolean;
  resourceServers?: boolean;
  hooks?: boolean;
  emailProvider?: boolean;
  branding?: boolean;
  promptSettings?: boolean;
}

export interface DefaultsProjectionConfig {
  /**
   * The control plane tenant id. Projected rows are written into the target
   * tenant's database under THIS id, so the existing runtime fallback resolves
   * them exactly as it does in a shared database.
   */
  controlPlaneTenantId: string;

  /**
   * Adapters for reading the control plane tenant's rows. Secrets are returned
   * decrypted (this should be the encrypted adapter), and are re-encrypted at
   * rest by the target adapter on write.
   */
  getControlPlaneAdapters: () => Promise<DataAdapters>;

  /**
   * Adapters for the target tenant's own database. For a WFP tenant this is the
   * adapter over the tenant's D1, ideally wrapped with a key ring that tags
   * control-plane-tenant rows with a control-plane-only key id so the tenant
   * operator cannot read the inherited secrets.
   */
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  /** Which entities to project. All default to true. */
  entities?: DefaultsProjectionEntities;

  /**
   * When false (default) the first failing entity throws, so a pilot rollout
   * fails loudly. When true, every entity is attempted and errors are collected
   * into the result instead.
   */
  continueOnError?: boolean;
}

export interface EntityProjectionOutcome {
  /** Rows created or updated. */
  upserted: number;
  /** Non-fatal errors, populated only when `continueOnError` is true. */
  errors: string[];
}

export interface DefaultsProjectionResult {
  tenantId: string;
  connections: EntityProjectionOutcome;
  resourceServers: EntityProjectionOutcome;
  hooks: EntityProjectionOutcome;
  emailProvider: EntityProjectionOutcome;
  branding: EntityProjectionOutcome;
  promptSettings: EntityProjectionOutcome;
}

function emptyOutcome(): EntityProjectionOutcome {
  return { upserted: 0, errors: [] };
}

function isInheritableHook(hook: Hook): boolean {
  const metadata = (hook as { metadata?: Record<string, unknown> }).metadata;
  return Boolean(metadata && metadata.inheritable === true);
}

/**
 * Runs `op`, routing any failure either to a thrown error (loud, default) or to
 * the outcome's `errors` array (when `continueOnError`).
 */
async function attempt(
  outcome: EntityProjectionOutcome,
  label: string,
  continueOnError: boolean,
  op: () => Promise<void>,
): Promise<void> {
  try {
    await op();
  } catch (error) {
    const message = `${label}: ${error instanceof Error ? error.message : String(error)}`;
    if (!continueOnError) {
      throw new Error(message, { cause: error });
    }
    outcome.errors.push(message);
  }
}

/**
 * Projects the control plane tenant's inheritable defaults into a single target
 * tenant's database, writing the rows under the control plane tenant id so the
 * existing runtime fallback resolves them with no read-path change.
 *
 * Idempotent: every row is upserted by its stable id, so re-running the
 * projection (a re-sync, or a later rollout) converges rather than duplicating.
 */
export async function projectControlPlaneDefaults(
  config: DefaultsProjectionConfig,
  targetTenantId: string,
): Promise<DefaultsProjectionResult> {
  const {
    controlPlaneTenantId: cpId,
    getControlPlaneAdapters,
    getAdapters,
    entities = {},
    continueOnError = false,
  } = config;

  const project = {
    connections: entities.connections ?? true,
    resourceServers: entities.resourceServers ?? true,
    hooks: entities.hooks ?? true,
    emailProvider: entities.emailProvider ?? true,
    branding: entities.branding ?? true,
    promptSettings: entities.promptSettings ?? true,
  };

  const cp = await getControlPlaneAdapters();
  const target = await getAdapters(targetTenantId);

  const result: DefaultsProjectionResult = {
    tenantId: targetTenantId,
    connections: emptyOutcome(),
    resourceServers: emptyOutcome(),
    hooks: emptyOutcome(),
    emailProvider: emptyOutcome(),
    branding: emptyOutcome(),
    promptSettings: emptyOutcome(),
  };

  if (project.connections) {
    const connections = await fetchAll<Connection>(
      (params) => cp.connections.list(cpId, params),
      "connections",
      { cursorField: "id", pageSize: 100 },
    );
    for (const connection of connections) {
      const id = connection.id;
      if (!id) continue;
      await attempt(
        result.connections,
        `connection ${id}`,
        continueOnError,
        async () => {
          const insert = connectionInsertSchema.parse(connection);
          const existing = await target.connections.get(cpId, id);
          if (existing) {
            await target.connections.update(cpId, id, insert);
          } else {
            await target.connections.create(cpId, insert);
          }
          result.connections.upserted += 1;
        },
      );
    }
  }

  if (project.resourceServers) {
    const resourceServers = await fetchAll<ResourceServer>(
      (params) => cp.resourceServers.list(cpId, params),
      "resource_servers",
      { cursorField: "id", pageSize: 100 },
    );
    for (const rs of resourceServers) {
      if (!rs.is_system || !rs.id) continue;
      await attempt(
        result.resourceServers,
        `resource_server ${rs.id}`,
        continueOnError,
        async () => {
          const insert = resourceServerInsertSchema.parse(rs);
          const existing = await target.resourceServers.get(cpId, rs.id!);
          if (existing) {
            await target.resourceServers.update(cpId, rs.id!, insert);
          } else {
            await target.resourceServers.create(cpId, insert);
          }
          result.resourceServers.upserted += 1;
        },
      );
    }
  }

  if (project.hooks) {
    const hooks = await fetchAll<Hook>(
      (params) => cp.hooks.list(cpId, params),
      "hooks",
      { cursorField: "hook_id", pageSize: 100 },
    );
    for (const hook of hooks) {
      if (!isInheritableHook(hook) || !hook.hook_id) continue;
      await attempt(
        result.hooks,
        `hook ${hook.hook_id}`,
        continueOnError,
        async () => {
          const insert = hookInsertSchema.parse(hook);
          const existing = await target.hooks.get(cpId, hook.hook_id!);
          if (existing) {
            await target.hooks.update(cpId, hook.hook_id!, insert);
          } else {
            await target.hooks.create(cpId, insert);
          }
          result.hooks.upserted += 1;
        },
      );
    }
  }

  if (project.emailProvider) {
    await attempt(
      result.emailProvider,
      "email_provider",
      continueOnError,
      async () => {
        const provider = await cp.emailProviders.get(cpId);
        if (!provider) return;
        const existing = await target.emailProviders.get(cpId);
        if (existing) {
          await target.emailProviders.update(cpId, provider);
        } else {
          await target.emailProviders.create(cpId, provider);
        }
        result.emailProvider.upserted += 1;
      },
    );
  }

  if (project.branding) {
    await attempt(result.branding, "branding", continueOnError, async () => {
      const branding = await cp.branding.get(cpId);
      if (!branding) return;
      await target.branding.set(cpId, branding);
      result.branding.upserted += 1;
    });
  }

  if (project.promptSettings) {
    await attempt(
      result.promptSettings,
      "prompt_settings",
      continueOnError,
      async () => {
        const promptSetting = await cp.promptSettings.get(cpId);
        if (!promptSetting) return;
        await target.promptSettings.set(cpId, promptSetting);
        result.promptSettings.upserted += 1;
      },
    );
  }

  return result;
}
