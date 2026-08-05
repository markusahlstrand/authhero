import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scopeId, tenantId } from "@substrat-run/contracts";
import type { ScopeHost } from "@substrat-run/kernel";
import { seedWorld, type SeededTenant } from "../src/seed.js";
import {
  drainConsole,
  type LocalPlatformDeps,
} from "../src/platform-handlers.js";
import {
  AUTHCORE_SERVICE,
  CONSOLE_SCOPE,
  MALLORY,
  OPERATOR,
  PLATFORM_TENANT,
  SUPPORT,
} from "../src/constants.js";

let host: ScopeHost;
let deps: LocalPlatformDeps;
let dir: string;
let acme: SeededTenant;
let globex: SeededTenant;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "authhero-console-"));
  const seeded = await seedWorld(dir);
  host = seeded.host;
  deps = seeded.deps;
  const [a, g] = seeded.tenants;
  if (!a || !g) throw new Error("expected two seeded tenants");
  acme = a;
  globex = g;
});

afterAll(async () => {
  await host.close();
  await rm(dir, { recursive: true, force: true });
});

// The auth core reading its entitlement port, in a customer's own scope.
async function probe(
  t: { tenantId: string; authScopeId: string },
  feature: string,
  principal = AUTHCORE_SERVICE,
) {
  const stub = await host.getScope(
    principal,
    tenantId.parse(t.tenantId),
    scopeId.parse(t.authScopeId),
  );
  return (await stub.invoke("authcore/probe-feature", { feature })) as {
    feature: string;
    enabled: boolean;
    plan: string | null;
  };
}

async function consoleAs(principal: typeof OPERATOR) {
  return host.getScope(principal, PLATFORM_TENANT, CONSOLE_SCOPE);
}

interface ListedTenant {
  id: string;
  slug: string;
  plan: string;
  status: string;
  auth_scope_id: string;
}

async function listTenants(): Promise<ListedTenant[]> {
  const stub = await consoleAs(OPERATOR);
  return (await stub.invoke("controlplane/list-tenants")) as ListedTenant[];
}

describe("happy path", () => {
  it("the operator sees both seeded tenants, active after the drain", async () => {
    const tenants = await listTenants();
    expect(tenants.map((t) => t.slug).sort()).toEqual(["acme", "globex"]);
    expect(tenants.find((t) => t.slug === "acme")).toMatchObject({
      plan: "pro",
      status: "active",
    });
  });

  it("registering the same slug is idempotent (no second tenant)", async () => {
    const stub = await consoleAs(OPERATOR);
    const again = (await stub.invoke("controlplane/register-tenant", {
      slug: "acme",
      name: "Acme Inc",
      plan: "pro",
    })) as { tenantId: string; reused: boolean };
    expect(again.reused).toBe(true);
    expect(again.tenantId).toBe(acme.tenantId);
  });
});

describe("provisioning is honestly asynchronous — intent → drain → active", () => {
  it("a new tenant is 'provisioning' until the platform drains, then serves", async () => {
    const stub = await consoleAs(OPERATOR);
    const reg = (await stub.invoke("controlplane/register-tenant", {
      slug: "initech",
      name: "Initech",
      plan: "pro",
    })) as {
      tenantId: string;
      authScopeId: string;
      status: string;
      requestId: string;
    };
    expect(reg.status).toBe("provisioning");
    expect(reg.requestId).toBeTruthy();

    // Before the drain: listed as provisioning, and the auth scope does not exist.
    const before = await listTenants();
    expect(before.find((t) => t.slug === "initech")?.status).toBe(
      "provisioning",
    );
    await expect(probe(reg, "mfa")).rejects.toThrow(/unknown scope/i);

    // The platform drains — the SAME drain engine the hosted platform runs.
    const report = await drainConsole(deps);
    expect(report.done).toBeGreaterThanOrEqual(1);
    expect(report.failed).toBe(0);

    const after = await listTenants();
    expect(after.find((t) => t.slug === "initech")?.status).toBe("active");
    expect(await probe(reg, "mfa")).toMatchObject({
      enabled: true,
      plan: "pro",
    });
  });

  it("draining again is a no-op (two-phase idempotency)", async () => {
    const report = await drainConsole(deps);
    expect(report).toMatchObject({
      drained: 0,
      done: 0,
      failed: 0,
      pending: 0,
    });
  });
});

describe("the entitlements seam — a capability the CP sets is read by the auth core", () => {
  it("a Pro tenant is entitled to the features its plan grants", async () => {
    expect(await probe(acme, "mfa")).toMatchObject({
      enabled: true,
      plan: "pro",
    });
    expect(await probe(acme, "custom-domains")).toMatchObject({
      enabled: true,
    });
  });

  it("a Pro tenant is NOT entitled to an Enterprise-only feature", async () => {
    expect(await probe(acme, "saml")).toMatchObject({
      enabled: false,
      plan: null,
    });
  });

  it("a Free tenant holds no paid features", async () => {
    expect(await probe(globex, "mfa")).toMatchObject({ enabled: false });
    expect(await probe(globex, "saml")).toMatchObject({ enabled: false });
  });
});

describe("a plan change re-shapes what the auth core can read", () => {
  it("upgrading Free → Enterprise grants the new capabilities", async () => {
    const stub = await consoleAs(OPERATOR);
    await stub.invoke("controlplane/set-plan", {
      tenantId: globex.tenantId,
      plan: "enterprise",
    });
    await drainConsole(deps);
    expect(await probe(globex, "mfa")).toMatchObject({
      enabled: true,
      plan: "enterprise",
    });
    expect(await probe(globex, "saml")).toMatchObject({ enabled: true });
  });

  it("downgrading Pro → Free revokes them again", async () => {
    const stub = await consoleAs(OPERATOR);
    await stub.invoke("controlplane/set-plan", {
      tenantId: acme.tenantId,
      plan: "free",
    });
    await drainConsole(deps);
    expect(await probe(acme, "mfa")).toMatchObject({ enabled: false });
    expect(await probe(acme, "custom-domains")).toMatchObject({
      enabled: false,
    });
  });
});

describe("the denials — the whole point", () => {
  it("a read-only support agent cannot provision a tenant", async () => {
    const stub = await consoleAs(SUPPORT);
    await expect(
      stub.invoke("controlplane/register-tenant", {
        slug: "evil",
        name: "Evil",
        plan: "pro",
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("a denied operation enqueues NO intent (the ask rolls back with the write)", async () => {
    const report = await drainConsole(deps);
    expect(report.drained).toBe(0);
  });

  it("an attacker's wrong (tenant, scope) pair fails closed", async () => {
    await expect(
      host.getScope(MALLORY, tenantId.parse(acme.tenantId), CONSOLE_SCOPE),
    ).rejects.toThrow(/unknown scope/i);
  });

  it("an attacker with a valid stub but no grants is denied on invoke", async () => {
    const stub = await host.getScope(MALLORY, PLATFORM_TENANT, CONSOLE_SCOPE);
    await expect(stub.invoke("controlplane/list-tenants")).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("the auth-core operation does not resolve for the un-entitled platform tenant", async () => {
    const stub = await host.getScope(
      AUTHCORE_SERVICE,
      PLATFORM_TENANT,
      CONSOLE_SCOPE,
    );
    await expect(
      stub.invoke("authcore/probe-feature", { feature: "mfa" }),
    ).rejects.toThrow(/not entitled/i);
  });

  it("one customer's auth-core stub cannot be minted against another's scope", async () => {
    await expect(
      host.getScope(
        AUTHCORE_SERVICE,
        tenantId.parse(globex.tenantId),
        scopeId.parse(acme.authScopeId),
      ),
    ).rejects.toThrow(/unknown scope/i);
  });
});
