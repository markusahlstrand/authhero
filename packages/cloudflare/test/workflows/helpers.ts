import type {
  Tenant,
  TenantOperation,
  TenantOperationEvent,
  TenantOperationEventInsert,
  TenantOperationInsert,
  TenantOperationUpdate,
  TenantsDataAdapter,
  ListTenantOperationsParams,
} from "@authhero/adapter-interfaces";
import type {
  StepConfig,
  StepRunner,
  TenantOperationStores,
} from "@authhero/multi-tenancy";
import type {
  WorkflowInstanceHandle,
  WorkflowInstanceStatus,
  WorkflowsBinding,
} from "../../src/workflows";

export interface RecordedStepCall {
  name: string;
  config?: StepConfig;
}

function splitArgs<T>(
  configOrFn: StepConfig | (() => Promise<T>),
  maybeFn?: () => Promise<T>,
): { config?: StepConfig; fn: () => Promise<T> } {
  if (typeof configOrFn === "function") {
    return { fn: configOrFn };
  }
  if (!maybeFn) throw new Error("StepRunner.do called without a function");
  return { config: configOrFn, fn: maybeFn };
}

/** Executes each step's function exactly once, recording name + config. */
export function fakeStepRunner(): StepRunner & { calls: RecordedStepCall[] } {
  const calls: RecordedStepCall[] = [];
  return {
    calls,
    async do<T>(
      name: string,
      configOrFn: StepConfig | (() => Promise<T>),
      maybeFn?: () => Promise<T>,
    ): Promise<T> {
      const { config, fn } = splitArgs(configOrFn, maybeFn);
      calls.push({ name, config });
      return fn();
    },
  };
}

/**
 * Honors `config.retries.limit` with zero delay — models the engine
 * retrying a throwing step. Records one call entry per attempt.
 */
export function retryingStepRunner(): StepRunner & {
  calls: RecordedStepCall[];
} {
  const calls: RecordedStepCall[] = [];
  return {
    calls,
    async do<T>(
      name: string,
      configOrFn: StepConfig | (() => Promise<T>),
      maybeFn?: () => Promise<T>,
    ): Promise<T> {
      const { config, fn } = splitArgs(configOrFn, maybeFn);
      const attempts = 1 + (config?.retries?.limit ?? 0);
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        calls.push({ name, config });
        try {
          return await fn();
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}

/**
 * Returns memoized results for already-completed steps without invoking
 * their function — models Workflows resuming after an eviction. Steps not
 * in the memo run live and are added.
 */
export function replayStepRunner(memo: Map<string, unknown>): StepRunner & {
  executed: string[];
} {
  const executed: string[] = [];
  return {
    executed,
    async do<T>(
      name: string,
      configOrFn: StepConfig | (() => Promise<T>),
      maybeFn?: () => Promise<T>,
    ): Promise<T> {
      const { fn } = splitArgs(configOrFn, maybeFn);
      if (memo.has(name)) {
        return memo.get(name) as T;
      }
      executed.push(name);
      const result = await fn();
      memo.set(name, result);
      return result;
    },
  };
}

/** In-memory TenantOperationStores with the filters the reconciler needs. */
export function fakeStores(): TenantOperationStores & {
  operations: Map<string, TenantOperation>;
  events: TenantOperationEvent[];
} {
  const operations = new Map<string, TenantOperation>();
  const events: TenantOperationEvent[] = [];
  let opSeq = 0;
  let evtSeq = 0;

  return {
    operations,
    events,
    tenantOperations: {
      async create(input: TenantOperationInsert): Promise<TenantOperation> {
        const now = new Date().toISOString();
        const operation: TenantOperation = {
          id: `op_${++opSeq}`,
          tenant_id: input.tenant_id ?? null,
          rollout_id: input.rollout_id ?? null,
          kind: input.kind,
          status: "pending",
          current_step: null,
          engine: input.engine,
          engine_instance_id: input.engine_instance_id ?? null,
          target_worker_version: input.target_worker_version ?? null,
          target_database_version: input.target_database_version ?? null,
          error: null,
          initiated_by: input.initiated_by ?? null,
          created_at: now,
          updated_at: now,
          finished_at: null,
        };
        operations.set(operation.id, operation);
        return operation;
      },
      async get(id: string): Promise<TenantOperation | null> {
        return operations.get(id) ?? null;
      },
      async list(params: ListTenantOperationsParams = {}) {
        const statuses =
          params.status === undefined
            ? undefined
            : Array.isArray(params.status)
              ? params.status
              : [params.status];
        const all = Array.from(operations.values()).filter((op) => {
          if (
            params.tenant_id !== undefined &&
            op.tenant_id !== params.tenant_id
          )
            return false;
          if (statuses && !statuses.includes(op.status)) return false;
          if (params.engine !== undefined && op.engine !== params.engine)
            return false;
          if (
            params.updated_before !== undefined &&
            !(op.updated_at < params.updated_before)
          )
            return false;
          return true;
        });
        const limit = params.per_page ?? 50;
        return {
          operations: all.slice(0, limit),
          start: 0,
          limit,
          length: Math.min(all.length, limit),
        };
      },
      async update(id: string, patch: TenantOperationUpdate): Promise<boolean> {
        const current = operations.get(id);
        if (!current) return false;
        operations.set(id, {
          ...current,
          ...patch,
          updated_at: new Date().toISOString(),
        });
        return true;
      },
      async remove(id: string): Promise<boolean> {
        return operations.delete(id);
      },
    },
    tenantOperationEvents: {
      async create(
        input: TenantOperationEventInsert,
      ): Promise<TenantOperationEvent> {
        const event: TenantOperationEvent = {
          id: `evt_${++evtSeq}`,
          operation_id: input.operation_id,
          step: input.step,
          outcome: input.outcome,
          detail: input.detail ?? null,
          attempt: input.attempt ?? 1,
          created_at: new Date().toISOString(),
        };
        events.push(event);
        return event;
      },
      async listByOperation(operation_id: string) {
        const matching = events.filter((e) => e.operation_id === operation_id);
        return {
          events: matching,
          start: 0,
          limit: 100,
          length: matching.length,
        };
      },
    },
  };
}

export function fakeTenants(
  initial: Array<Partial<Tenant> & { id: string }>,
): TenantsDataAdapter & { store: Map<string, Partial<Tenant>> } {
  const store = new Map<string, Partial<Tenant>>(initial.map((t) => [t.id, t]));
  return {
    store,
    async create(): Promise<Tenant> {
      throw new Error("not used in tests");
    },
    async get(id: string): Promise<Tenant | null> {
      return (store.get(id) as Tenant | undefined) ?? null;
    },
    async list() {
      return { tenants: Array.from(store.values()) as Tenant[] };
    },
    async update(id: string, patch: Partial<Tenant>): Promise<void> {
      const cur = store.get(id);
      if (cur) store.set(id, { ...cur, ...patch });
    },
    async remove(id: string): Promise<boolean> {
      return store.delete(id);
    },
  };
}

export function fakeBinding(): WorkflowsBinding & {
  created: Array<{ id: string; params: unknown }>;
  statuses: Map<string, WorkflowInstanceStatus>;
  createError?: Error;
  missingInstances: Set<string>;
  getErrors: Map<string, Error>;
} {
  const created: Array<{ id: string; params: unknown }> = [];
  const statuses = new Map<string, WorkflowInstanceStatus>();
  const missingInstances = new Set<string>();
  const getErrors = new Map<string, Error>();

  const binding = {
    created,
    statuses,
    createError: undefined as Error | undefined,
    missingInstances,
    getErrors,
    async create(options: {
      id: string;
      params: unknown;
    }): Promise<WorkflowInstanceHandle> {
      if (binding.createError) throw binding.createError;
      if (created.some((c) => c.id === options.id)) {
        throw new Error(`instance with id "${options.id}" already exists`);
      }
      created.push(options);
      return {
        id: options.id,
        status: async () => statuses.get(options.id) ?? { status: "running" },
      };
    },
    async get(id: string): Promise<WorkflowInstanceHandle> {
      const error = getErrors.get(id);
      if (error) throw error;
      if (missingInstances.has(id)) {
        throw new Error(`instance "${id}" not found`);
      }
      return {
        id,
        status: async () => statuses.get(id) ?? { status: "running" },
      };
    },
  };
  return binding;
}
