import { describe, it, expect, vi } from "vitest";
import type {
  CustomDomain,
  CustomDomainsAdapter,
  CustomDomainWithTenantId,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import {
  createControlPlaneCustomDomainsAdapter,
  CONTROL_PLANE_CUSTOM_DOMAINS_PATH,
} from "../../src/adapters/control-plane-custom-domains";
import type {
  ControlPlaneClient,
  ControlPlaneRequest,
} from "../../src/helpers/control-plane-client";

function domain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    custom_domain_id: "cd-1",
    domain: "login.acme.com",
    type: "auth0_managed_certs",
    primary: false,
    status: "pending",
    ...overrides,
  };
}

/** In-memory stand-in for the shard's own D1 rows. */
function makeMirror(
  seed: CustomDomain[] = [],
): CustomDomainsAdapter & { rows: Map<string, CustomDomainWithTenantId> } {
  const rows = new Map<string, CustomDomainWithTenantId>();
  for (const row of seed) {
    rows.set(`t1:${row.custom_domain_id}`, { ...row, tenant_id: "t1" });
  }

  return {
    rows,
    create: vi.fn(async (tenant_id, input) => {
      const created = domain({
        ...input,
        custom_domain_id: input.custom_domain_id ?? "cd-generated",
      });
      rows.set(`${tenant_id}:${created.custom_domain_id}`, {
        ...created,
        tenant_id,
      });
      return created;
    }),
    get: vi.fn(async (tenant_id, id) => {
      const row = rows.get(`${tenant_id}:${id}`);
      if (!row) return null;
      const { tenant_id: _t, ...rest } = row;
      return rest;
    }),
    getByDomain: vi.fn(
      async (host) =>
        [...rows.values()].find((row) => row.domain === host) ?? null,
    ),
    list: vi.fn(async (tenant_id) =>
      [...rows.values()]
        .filter((row) => row.tenant_id === tenant_id)
        .map(({ tenant_id: _t, ...rest }) => rest),
    ),
    update: vi.fn(async (tenant_id, id, patch) => {
      const key = `${tenant_id}:${id}`;
      const existing = rows.get(key);
      if (!existing) return false;
      rows.set(key, { ...existing, ...patch });
      return true;
    }),
    remove: vi.fn(async (tenant_id, id) => rows.delete(`${tenant_id}:${id}`)),
  };
}

function makeClient(
  respond: (req: ControlPlaneRequest) => { status: number; data?: unknown },
): ControlPlaneClient & { calls: ControlPlaneRequest[] } {
  const calls: ControlPlaneRequest[] = [];
  return {
    calls,
    request: vi.fn(async (req: ControlPlaneRequest) => {
      calls.push(req);
      const { status, data } = respond(req);
      return { status, data: data ?? null };
    }),
  };
}

describe("createControlPlaneCustomDomainsAdapter", () => {
  it("creates through the control plane and mirrors the result locally", async () => {
    const mirror = makeMirror();
    const client = makeClient(() => ({
      status: 201,
      data: domain({ custom_domain_id: "cd-cp" }),
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const created = await adapter.create("t1", {
      domain: "login.acme.com",
      type: "auth0_managed_certs",
    });

    expect(created).toMatchObject({ custom_domain_id: "cd-cp" });
    expect(client.calls[0]).toMatchObject({
      method: "POST",
      path: CONTROL_PLANE_CUSTOM_DOMAINS_PATH,
      body: { tenant_id: "t1", domain: "login.acme.com" },
    });
    // The row landed in the local mirror so getByDomain can resolve it.
    expect(await mirror.getByDomain("login.acme.com")).toMatchObject({
      custom_domain_id: "cd-cp",
      tenant_id: "t1",
    });
  });

  it("surfaces a 409 and writes nothing locally — no half-provisioned row", async () => {
    const mirror = makeMirror();
    const client = makeClient(() => ({
      status: 409,
      data: { error: "conflict", message: "already registered" },
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    await expect(
      adapter.create("t1", {
        domain: "login.acme.com",
        type: "auth0_managed_certs",
      }),
    ).rejects.toThrow(HTTPException);

    expect(mirror.create).not.toHaveBeenCalled();
    expect(mirror.rows.size).toBe(0);
  });

  it("preserves the 409 status so the management API answers with a conflict", async () => {
    const mirror = makeMirror();
    const client = makeClient(() => ({
      status: 409,
      data: { message: "already registered" },
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const err = await adapter
      .create("t1", { domain: "login.acme.com", type: "auth0_managed_certs" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPException);
    expect((err as HTTPException).status).toBe(409);
  });

  it("serves a ready domain from the mirror without a network hop", async () => {
    const mirror = makeMirror([domain({ status: "ready" })]);
    const client = makeClient(() => ({ status: 500 }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const found = await adapter.get("t1", "cd-1");

    expect(found).toMatchObject({ custom_domain_id: "cd-1", status: "ready" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("refreshes a pending domain from the control plane and re-mirrors it", async () => {
    // The pending → ready transition happens upstream (the customer added the
    // DV record), so a non-ready mirror row must not be trusted.
    const mirror = makeMirror([domain({ status: "pending" })]);
    const client = makeClient(() => ({
      status: 200,
      data: domain({ status: "ready" }),
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const found = await adapter.get("t1", "cd-1");

    expect(found).toMatchObject({ status: "ready" });
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(mirror.rows.get("t1:cd-1")).toMatchObject({ status: "ready" });
  });

  it("serves the stale mirror row when the control plane is unreachable", async () => {
    const mirror = makeMirror([domain({ status: "pending" })]);
    const client: ControlPlaneClient = {
      request: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const found = await adapter.get("t1", "cd-1");
    expect(found).toMatchObject({
      custom_domain_id: "cd-1",
      status: "pending",
    });
  });

  it("drops the mirror row when the domain is gone upstream", async () => {
    const mirror = makeMirror([domain({ status: "pending" })]);
    const client = makeClient(() => ({ status: 404 }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    expect(await adapter.get("t1", "cd-1")).toBeNull();
    expect(mirror.rows.size).toBe(0);
  });

  it("resolves getByDomain from the mirror only — it is on the request path", async () => {
    const mirror = makeMirror([domain({ status: "pending" })]);
    const client = makeClient(() => ({ status: 500 }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const resolved = await adapter.getByDomain("login.acme.com");

    expect(resolved).toMatchObject({ tenant_id: "t1" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("prunes mirror rows the control plane no longer has on list", async () => {
    const mirror = makeMirror([
      domain({ status: "pending" }),
      domain({ custom_domain_id: "cd-stale", domain: "old.acme.com" }),
    ]);
    const client = makeClient(() => ({
      status: 200,
      data: [domain({ status: "ready" })],
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const list = await adapter.list("t1");

    expect(list).toHaveLength(1);
    expect(mirror.rows.has("t1:cd-stale")).toBe(false);
    expect(mirror.rows.get("t1:cd-1")).toMatchObject({ status: "ready" });
  });

  it("serves mirror rows for list when every domain is ready", async () => {
    const mirror = makeMirror([domain({ status: "ready" })]);
    const client = makeClient(() => ({ status: 500 }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    expect(await adapter.list("t1")).toHaveLength(1);
    expect(client.request).not.toHaveBeenCalled();
  });

  it("removes upstream first, then clears the mirror", async () => {
    const mirror = makeMirror([domain({ status: "ready" })]);
    const client = makeClient(() => ({ status: 204 }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    expect(await adapter.remove("t1", "cd-1")).toBe(true);
    expect(client.calls[0]).toMatchObject({ method: "DELETE" });
    expect(mirror.rows.size).toBe(0);
  });

  it("updates upstream and mirrors the returned record", async () => {
    const mirror = makeMirror([domain({ status: "ready" })]);
    const client = makeClient(() => ({
      status: 200,
      data: domain({ status: "ready", tls_policy: "recommended" }),
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    expect(
      await adapter.update("t1", "cd-1", { tls_policy: "recommended" }),
    ).toBe(true);
    expect(mirror.rows.get("t1:cd-1")).toMatchObject({
      tls_policy: "recommended",
    });
  });

  it("reports an upstream failure as a 502 rather than a local success", async () => {
    const mirror = makeMirror();
    const client = makeClient(() => ({
      status: 503,
      data: { message: "down" },
    }));
    const adapter = createControlPlaneCustomDomainsAdapter({ client, mirror });

    const err = await adapter
      .create("t1", { domain: "login.acme.com", type: "auth0_managed_certs" })
      .catch((e: unknown) => e);

    expect((err as HTTPException).status).toBe(502);
    expect(mirror.rows.size).toBe(0);
  });
});
