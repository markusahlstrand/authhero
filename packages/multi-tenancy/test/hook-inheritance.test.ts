import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import createAdapters, {
  Database,
  migrateToLatest,
} from "@authhero/kysely-adapter";
import { withRuntimeFallback } from "../src/middleware/settings-inheritance";

const controlPlaneTenantId = "control_plane";
const subTenantId = "tenant-1";

describe("Hook inheritance from control plane", () => {
  let db: Kysely<Database>;
  let baseAdapters: ReturnType<typeof createAdapters>;
  let adapters: ReturnType<typeof createAdapters>;

  beforeEach(async () => {
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
    });
    await migrateToLatest(db, false);
    baseAdapters = createAdapters(db);
    adapters = withRuntimeFallback(baseAdapters, {
      controlPlaneTenantId,
    }) as typeof baseAdapters;

    // Tenants need to exist for FK constraints.
    await baseAdapters.tenants.create({
      id: controlPlaneTenantId,
      friendly_name: "Control Plane",
    });
    await baseAdapters.tenants.create({
      id: subTenantId,
      friendly_name: "Sub-tenant",
    });
  });

  it("surfaces an inheritable control-plane hook on a sub-tenant's list", async () => {
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    const { hooks } = await adapters.hooks.list(subTenantId, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    expect(hooks).toHaveLength(1);
    const inherited = hooks[0] as any;
    expect(inherited.template_id).toBe("account-linking");
    expect(inherited.metadata?.inheritable).toBe(true);
  });

  it("does NOT surface a non-inheritable control-plane hook", async () => {
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      // metadata.inheritable not set
    });

    const { hooks } = await adapters.hooks.list(subTenantId, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    expect(hooks).toHaveLength(0);
  });

  it("merges sub-tenant own hooks with inherited ones", async () => {
    // Sub-tenant has its own hook
    await baseAdapters.hooks.create(subTenantId, {
      trigger_id: "post-user-login",
      template_id: "ensure-username",
      enabled: true,
    });
    // Control plane publishes one inheritable
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    const { hooks } = await adapters.hooks.list(subTenantId, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const templateIds = hooks
      .map((h: any) => h.template_id)
      .filter(Boolean)
      .sort();
    expect(templateIds).toEqual(["account-linking", "ensure-username"]);
  });

  it("the control plane itself does not see double entries (no self-merge)", async () => {
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    const { hooks } = await adapters.hooks.list(controlPlaneTenantId, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    expect(hooks).toHaveLength(1);
  });

  it("trigger_id filter applies to both sides", async () => {
    // Inheritable on a different trigger
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-registration",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });
    // Inheritable on the trigger we're filtering for
    await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    const { hooks } = await adapters.hooks.list(subTenantId, {
      q: "trigger_id:post-user-login",
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    expect(hooks).toHaveLength(1);
    expect((hooks[0] as any).trigger_id).toBe("post-user-login");
  });

  it("get() falls through to the control plane for inheritable hooks", async () => {
    const created = await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    const fetched = await adapters.hooks.get(subTenantId, created.hook_id);
    expect(fetched).not.toBeNull();
    expect((fetched as any)?.template_id).toBe("account-linking");
  });

  it("get() does NOT fall through for non-inheritable hooks", async () => {
    const created = await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
    });

    const fetched = await adapters.hooks.get(subTenantId, created.hook_id);
    expect(fetched).toBeNull();
  });

  it("sub-tenant cannot update or delete an inherited hook", async () => {
    const created = await baseAdapters.hooks.create(controlPlaneTenantId, {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
      metadata: { inheritable: true },
    });

    // The base adapter's WHERE tenant_id clause means cross-tenant writes
    // are silent no-ops; the inherited hook stays untouched.
    await adapters.hooks.update(subTenantId, created.hook_id, {
      enabled: false,
    });
    await adapters.hooks.remove(subTenantId, created.hook_id);

    const stillThere = await baseAdapters.hooks.get(
      controlPlaneTenantId,
      created.hook_id,
    );
    expect(stillThere?.enabled).toBe(true);
  });
});
