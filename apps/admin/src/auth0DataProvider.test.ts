import { describe, it, expect, vi, beforeEach } from "vitest";

// The provider builds an Auth0 ManagementClient through `./authProvider`,
// which pulls in auth0-spa-js and reads browser auth state. Stub the whole
// module so these tests only exercise the mapping layer.
const { managementClient } = vi.hoisted(() => ({
  managementClient: {
    users: { list: vi.fn(), get: vi.fn() },
    resourceServers: { get: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("./authProvider", () => ({
  createManagementClient: vi.fn(async () => managementClient),
  resolveAccessToken: vi.fn(async () => "test-token"),
}));

import auth0DataProvider from "./auth0DataProvider";

const API_URL = "https://api.example.com";
const TENANT_ID = "tenant-1";
// react-admin always sends a sort order; an empty field means "no sort".
const NO_SORT = { field: "", order: "ASC" } as const;

interface HttpCall {
  url: string;
  options?: RequestInit;
}

/**
 * Minimal stand-in for `fetchUtils.fetchJson`: records every call and returns
 * whatever the handler produces as the parsed `json` body.
 */
function createHttpClient(handler: (call: HttpCall) => unknown) {
  const calls: HttpCall[] = [];
  const client = async (url: string, options?: RequestInit) => {
    calls.push({ url, options });
    return {
      status: 200,
      headers: new Headers(),
      body: "",
      json: handler({ url, options }),
    };
  };
  return { client, calls };
}

function bodyOf(call: HttpCall | undefined): Record<string, unknown> {
  const body = call?.options?.body;
  if (typeof body !== "string") {
    throw new Error("expected a string request body");
  }
  return JSON.parse(body);
}

function headerOf(call: HttpCall | undefined, name: string): string | null {
  const headers = call?.options?.headers;
  return new Headers(headers).get(name);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getList", () => {
  it("maps pagination, sort and filters onto management-api query params", async () => {
    const { client, calls } = createHttpClient(() => ({
      proxy_routes: [{ id: "route-1" }, { id: "route-2" }],
      total: 7,
    }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.getList("proxy-routes", {
      pagination: { page: 2, perPage: 25 },
      sort: { field: "name", order: "DESC" },
      filter: { q: "foo", enabled: true },
    });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api/v2/proxy-routes");
    // react-admin pages are 1-based, the management API is 0-based.
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("include_totals")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("name:-1");
    expect(url.searchParams.get("q")).toBe("foo");
    // Non-`q` filter entries pass through as plain query params.
    expect(url.searchParams.get("enabled")).toBe("true");
    expect(headerOf(calls[0], "tenant-id")).toBe(TENANT_ID);

    expect(result).toEqual({
      data: [{ id: "route-1" }, { id: "route-2" }],
      total: 7,
    });
  });

  it("encodes an ascending sort as `field:1` and omits it when unset", async () => {
    const { client, calls } = createHttpClient(() => ({ proxy_routes: [] }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    await provider.getList("proxy-routes", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "name", order: "ASC" },
      filter: {},
    });
    expect(new URL(calls[0].url).searchParams.get("sort")).toBe("name:1");

    await provider.getList("proxy-routes", {
      pagination: { page: 1, perPage: 10 },
      sort: NO_SORT,
      filter: {},
    });
    expect(new URL(calls[1].url).searchParams.has("sort")).toBe(false);
  });

  it("reads the list off the snake_cased response key and totals a bare array", async () => {
    const { client } = createHttpClient(({ url }) =>
      url.includes("/permissions")
        ? [{ id: "p_1" }, { id: "p_2" }]
        : { proxy_routes: [{ id: "route-1" }], total: 1 },
    );
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);
    const params = {
      pagination: { page: 1, perPage: 10 },
      sort: NO_SORT,
      filter: {},
    };

    // Hyphenated resource, snake_cased response key.
    expect(await provider.getList("proxy-routes", params)).toEqual({
      data: [{ id: "route-1" }],
      total: 1,
    });

    // Some endpoints answer with a bare array and no envelope.
    expect(await provider.getList("users/auth0|1/permissions", params)).toEqual(
      {
        data: [{ id: "p_1" }, { id: "p_2" }],
        total: 2,
      },
    );
  });

  it("rewrites resource names that differ from their API path", async () => {
    const { client, calls } = createHttpClient(() => ({ actions: [] }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    await provider.getList("actions", {
      pagination: { page: 1, perPage: 10 },
      sort: NO_SORT,
      filter: {},
    });

    expect(new URL(calls[0].url).pathname).toBe("/api/v2/actions/actions");
  });

  it("merges extra user filters into the Lucene query and escapes them", async () => {
    managementClient.users.list.mockResolvedValue({
      response: { users: [{ user_id: "auth0|1", email: "a@b.com" }], total: 3 },
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.getList("users", {
      pagination: { page: 2, perPage: 10 },
      sort: { field: "created_at", order: "DESC" },
      filter: { q: 'email:"a@b.com"', name: 'O"Brien (test)' },
    });

    expect(managementClient.users.list).toHaveBeenCalledWith({
      page: 1,
      per_page: 10,
      sort: "created_at:-1",
      q: 'email:"a@b.com" name:"O\\"Brien \\(test\\)"',
      include_totals: true,
    });
    // The list id comes from `user_id`, not from a missing `id`.
    expect(result).toEqual({
      data: [{ id: "auth0|1", user_id: "auth0|1", email: "a@b.com" }],
      total: 3,
    });
  });

  it("drops empty user filter values and sends no query when nothing is set", async () => {
    managementClient.users.list.mockResolvedValue({
      response: [{ user_id: "auth0|1" }],
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.getList("users", {
      pagination: { page: 1, perPage: 10 },
      sort: NO_SORT,
      filter: { name: "", org_id: null, email: "x@y.z" },
    });

    expect(managementClient.users.list.mock.calls[0][0]).toMatchObject({
      q: 'email:"x@y.z"',
      sort: undefined,
    });

    // A bare array response is passed straight through.
    expect(result).toEqual({
      data: [{ id: "auth0|1", user_id: "auth0|1" }],
      total: 1,
    });

    await provider.getList("users", {
      pagination: { page: 1, perPage: 10 },
      sort: NO_SORT,
      filter: {},
    });
    expect(managementClient.users.list.mock.calls[1][0].q).toBeUndefined();
  });
});

describe("getList for the virtual resource-server-scopes resource", () => {
  const scopes = [
    { value: "read:users", description: "Read users" },
    { value: "write:users", description: "Write users" },
    { value: "write:clients", description: "Write clients" },
  ];

  it("returns nothing when the parent resource server is not in the filter", async () => {
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    expect(
      await provider.getList("resource-server-scopes", {
        pagination: { page: 1, perPage: 10 },
        sort: NO_SORT,
        filter: {},
      }),
    ).toEqual({ data: [], total: 0 });
    expect(managementClient.resourceServers.get).not.toHaveBeenCalled();
  });

  it("ids each scope by parent and value", async () => {
    managementClient.resourceServers.get.mockResolvedValue({
      response: { scopes },
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.getList("resource-server-scopes", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "value", order: "ASC" },
      filter: { resource_server_id: "rs_1" },
    });

    expect(managementClient.resourceServers.get).toHaveBeenCalledWith("rs_1");
    expect(result.total).toBe(3);
    expect(result.data.map((s: { id: string }) => s.id)).toEqual([
      "rs_1:read:users",
      "rs_1:write:clients",
      "rs_1:write:users",
    ]);
  });

  it("searches, sorts and pages the scopes client-side", async () => {
    managementClient.resourceServers.get.mockResolvedValue({ scopes });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    // `q` matches on value or description.
    const searched = await provider.getList("resource-server-scopes", {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "value", order: "DESC" },
      filter: { resource_server_id: "rs_1", q: "clients" },
    });
    expect(searched.data.map((s: { value: string }) => s.value)).toEqual([
      "write:clients",
    ]);
    expect(searched.total).toBe(1);

    // The total counts matches, not the returned page.
    const paged = await provider.getList("resource-server-scopes", {
      pagination: { page: 2, perPage: 2 },
      sort: { field: "value", order: "DESC" },
      filter: { resource_server_id: "rs_1" },
    });
    expect(paged.data.map((s: { value: string }) => s.value)).toEqual([
      "read:users",
    ]);
    expect(paged.total).toBe(3);
  });
});

describe("getOne", () => {
  it("unwraps the SDK envelope and ids a user by user_id", async () => {
    managementClient.users.get.mockResolvedValue({
      response: { user_id: "auth0|1", email: "a@b.com" },
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    expect(await provider.getOne("users", { id: "auth0|1" })).toEqual({
      data: { id: "auth0|1", user_id: "auth0|1", email: "a@b.com" },
    });
    expect(managementClient.users.get).toHaveBeenCalledWith("auth0|1");
  });

  it("fetches other resources over HTTP with the tenant header", async () => {
    const { client, calls } = createHttpClient(() => ({
      id: "route-1",
      name: "Route",
    }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.getOne("proxy-routes", { id: "route-1" });

    expect(calls[0].url).toBe(`${API_URL}/api/v2/proxy-routes/route-1`);
    expect(headerOf(calls[0], "tenant-id")).toBe(TENANT_ID);
    expect(result).toEqual({ data: { id: "route-1", name: "Route" } });
  });

  it("splits a scope id on the first colon so scope values may contain colons", async () => {
    managementClient.resourceServers.get.mockResolvedValue({
      response: { scopes: [{ value: "read:users", description: "Read" }] },
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    expect(
      await provider.getOne("resource-server-scopes", {
        id: "rs_1:read:users",
      }),
    ).toEqual({
      data: {
        id: "rs_1:read:users",
        resource_server_id: "rs_1",
        value: "read:users",
        description: "Read",
      },
    });
  });

  it("rejects a scope id with no parent and an unknown scope value", async () => {
    managementClient.resourceServers.get.mockResolvedValue({
      response: { scopes: [{ value: "read:users" }] },
    });
    const { client } = createHttpClient(() => ({}));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    await expect(
      provider.getOne("resource-server-scopes", { id: "no-colon" }),
    ).rejects.toThrow("Invalid scope id");
    await expect(
      provider.getOne("resource-server-scopes", { id: "rs_1:nope" }),
    ).rejects.toThrow('Scope "nope" not found');
  });
});

describe("update", () => {
  it("strips server-owned fields but keeps nulls as explicit unsets", async () => {
    const { client, calls } = createHttpClient(() => ({
      hook_id: "hook-1",
      name: "New",
    }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.update("hooks", {
      id: "hook-1",
      previousData: { id: "hook-1" },
      data: {
        id: "hook-1",
        tenant_id: "tenant-1",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
        identities: [],
        connections: [],
        user_id: "auth0|1",
        last_login: "2026-01-03",
        provider: "auth2",
        name: "New",
        // null survives: PATCH uses it to clear the field.
        description: null,
        // undefined is dropped: the form simply never touched it.
        script: undefined,
      },
    });

    expect(calls[0].options?.method).toBe("PATCH");
    expect(bodyOf(calls[0])).toEqual({ name: "New", description: null });
    // The response carries no `id`, so the singular `<resource>_id` is used.
    expect(result.data.id).toBe("hook-1");
  });

  it("prefers an id already present on the response", async () => {
    const { client } = createHttpClient(() => ({ id: "hook-1", name: "New" }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.update("hooks", {
      id: "hook-1",
      previousData: {},
      data: { name: "New" },
    });

    expect(result.data).toEqual({ id: "hook-1", name: "New" });
  });
});

describe("create", () => {
  it("drops null and undefined form values but keeps falsy ones", async () => {
    const { client, calls } = createHttpClient(() => ({ hook_id: "hook-1" }));
    const provider = auth0DataProvider(API_URL, client, TENANT_ID);

    const result = await provider.create("hooks", {
      data: {
        name: "Hook",
        description: null,
        script: undefined,
        enabled: false,
        order: 0,
        notes: "",
      },
    });

    expect(calls[0].url).toBe(`${API_URL}/api/v2/hooks`);
    expect(calls[0].options?.method).toBe("POST");
    expect(bodyOf(calls[0])).toEqual({
      name: "Hook",
      enabled: false,
      order: 0,
      notes: "",
    });
    expect(headerOf(calls[0], "tenant-id")).toBe(TENANT_ID);
    expect(result.data.id).toBe("hook-1");
  });

  it("omits the tenant header when the provider is not tenant-scoped", async () => {
    const { client, calls } = createHttpClient(() => ({ id: "t-1" }));
    const provider = auth0DataProvider(API_URL, client);

    await provider.create("tenants", { data: { name: "t-1" } });

    expect(headerOf(calls[0], "tenant-id")).toBeNull();
  });
});
