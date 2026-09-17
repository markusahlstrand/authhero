import { describe, it, expect } from "vitest";
import { signJWT } from "../../../src/utils/jwt";
import { MANAGEMENT_API_AUDIENCE } from "../../../src/middlewares/authentication";
import { getTestServer } from "../../helpers/test-server";
import { getCertificate, pemToBuffer } from "../../helpers/token";

const CONTROL_PLANE = "tenantId";
const ISSUER = "http://localhost:3000/";
const USER_ID = "email|userId";
const EXCHANGE_CLIENT_ID = "mcp-exchange";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";

type TestServer = Awaited<ReturnType<typeof getTestServer>>;

async function setup(): Promise<TestServer> {
  const server = await getTestServer({
    mcp: { exchangeClientId: EXCHANGE_CLIENT_ID },
  });
  const { env } = server;
  env.data.multiTenancyConfig = { controlPlaneTenantId: CONTROL_PLANE };

  for (const id of ["acme", "other"]) {
    await env.data.tenants.create({
      id,
      friendly_name: id,
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
  }
  await env.data.users.create("acme", {
    user_id: "email|acme-user",
    email: "jane@acme.test",
    email_verified: true,
    connection: "email",
    provider: "email",
    is_social: false,
  });
  await env.data.clients.create("acme", {
    client_id: "acme-app",
    client_secret: "super-secret-value",
    name: "Acme app",
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
  });

  // Control plane: exchange client, management API, and an org per tenant.
  await env.data.clients.create(CONTROL_PLANE, {
    client_id: EXCHANGE_CLIENT_ID,
    client_secret: "exchange-secret",
    name: "MCP exchange",
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
    organization_usage: "allow",
    grant_types: [TOKEN_EXCHANGE_GRANT],
  });
  await env.data.resourceServers.create(CONTROL_PLANE, {
    name: "Management API",
    identifier: MANAGEMENT_API_AUDIENCE,
    scopes: [{ value: "read:users" }, { value: "read:clients" }],
    options: { enforce_policies: true, token_dialect: "access_token_authz" },
  });
  const role = await env.data.roles.create(CONTROL_PLANE, {
    name: "Tenant Admin",
  });
  await env.data.rolePermissions.assign(CONTROL_PLANE, role.id, [
    {
      role_id: role.id,
      resource_server_identifier: MANAGEMENT_API_AUDIENCE,
      permission_name: "read:users",
    },
    {
      role_id: role.id,
      resource_server_identifier: MANAGEMENT_API_AUDIENCE,
      permission_name: "read:clients",
    },
  ]);
  const acmeOrg = await env.data.organizations.create(CONTROL_PLANE, {
    name: "acme",
    display_name: "Acme",
  });
  await env.data.organizations.create(CONTROL_PLANE, { name: "other" });
  await env.data.userOrganizations.create(CONTROL_PLANE, {
    user_id: USER_ID,
    organization_id: acmeOrg.id,
  });
  await env.data.userRoles.create(CONTROL_PLANE, USER_ID, role.id, acmeOrg.id);

  return server;
}

async function mintToken(
  overrides: { iss?: string; act?: { sub: string } } = {},
): Promise<string> {
  const signingKey = await getCertificate();
  return signJWT(
    "RS256",
    pemToBuffer(signingKey.pkcs7!),
    {
      iss: overrides.iss ?? ISSUER,
      sub: USER_ID,
      aud: "https://example.com",
      scope: "openid profile",
      tenant_id: CONTROL_PLANE,
      ...(overrides.act ? { act: overrides.act } : {}),
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: 3600,
      headers: { kid: signingKey.kid },
    },
  );
}

function post(
  { app, env }: TestServer,
  body: unknown,
  options: { token?: string; host?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.host) headers["x-forwarded-host"] = options.host;
  return app.request(
    "http://localhost:3000/mcp",
    { method: "POST", headers, body: JSON.stringify(body) },
    env,
  );
}

interface ToolCallResult {
  result: { content: { type: string; text: string }[]; isError?: boolean };
}

async function callTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown>,
  options: { host?: string } = {},
) {
  const response = await post(
    server,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
    { token: await mintToken(), ...options },
  );
  expect(response.status).toBe(200);
  const body: ToolCallResult = await response.json();
  return {
    isError: body.result.isError === true,
    text: body.result.content[0]!.text,
  };
}

describe("MCP endpoint", () => {
  describe("protected resource metadata", () => {
    it("names the control-plane issuer on the control-plane host", async () => {
      const server = await setup();
      const response = await server.app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource/mcp",
        {},
        server.env,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        resource: "http://localhost:3000/mcp",
        authorization_servers: [ISSUER],
        bearer_methods_supported: ["header"],
      });
    });

    it("uses the tenant host as the resource on a tenant host", async () => {
      const server = await setup();
      const response = await server.app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource",
        { headers: { "x-forwarded-host": "acme.localhost:3000" } },
        server.env,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        resource: "https://acme.localhost:3000/mcp",
        authorization_servers: [ISSUER],
      });
      expect(body.resource_name).toContain("acme");
    });
  });

  describe("authentication", () => {
    it("challenges a request without a token", async () => {
      const server = await setup();
      const response = await post(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"',
      );
    });

    it("rejects a token from another issuer", async () => {
      const server = await setup();
      const response = await post(
        server,
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        { token: await mintToken({ iss: "https://elsewhere.example.com/" }) },
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        'error="invalid_token"',
      );
    });

    it("rejects an already-delegated token", async () => {
      const server = await setup();
      const response = await post(
        server,
        { jsonrpc: "2.0", id: 1, method: "initialize" },
        { token: await mintToken({ act: { sub: "some-client" } }) },
      );
      expect(response.status).toBe(401);
    });
  });

  describe("protocol", () => {
    it("answers initialize with the requested protocol version", async () => {
      const server = await setup();
      const response = await post(
        server,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18" },
        },
        { token: await mintToken() },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.protocolVersion).toBe("2025-06-18");
      expect(body.result.capabilities).toEqual({
        tools: { listChanged: false },
      });
    });

    it("returns 202 for a body with only notifications", async () => {
      const server = await setup();
      const response = await post(
        server,
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { token: await mintToken() },
      );
      expect(response.status).toBe(202);
    });

    it("does not apply its CORS policy to other routes", async () => {
      const server = await setup();
      const response = await server.app.request(
        "http://localhost:3000/robots.txt",
        { headers: { origin: "https://attacker.example" } },
        server.env,
      );
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("returns 405 for GET", async () => {
      const server = await setup();
      const response = await server.app.request(
        "http://localhost:3000/mcp",
        {},
        server.env,
      );
      expect(response.status).toBe(405);
    });
  });

  describe("control-plane host", () => {
    it("lists tools that take a tenant_id", async () => {
      const server = await setup();
      const response = await post(
        server,
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { token: await mintToken() },
      );
      const body = await response.json();
      const tools: { name: string; inputSchema: { required?: string[] } }[] =
        body.result.tools;
      expect(tools.map((t) => t.name)).toContain("list_tenants");
      const listUsers = tools.find((t) => t.name === "list_users");
      expect(listUsers?.inputSchema.required).toEqual(["tenant_id"]);
    });

    it("lists only the tenants the caller is an organization member of", async () => {
      const server = await setup();
      const { isError, text } = await callTool(server, "list_tenants", {});
      expect(isError).toBe(false);
      expect(JSON.parse(text)).toEqual([
        { tenant_id: "acme", display_name: "Acme" },
      ]);
    });

    it("reads a member tenant's users through the management API", async () => {
      const server = await setup();
      const { isError, text } = await callTool(server, "list_users", {
        tenant_id: "acme",
      });
      expect(isError).toBe(false);
      expect(text).toContain("jane@acme.test");
    });

    it("refuses a tenant the caller is not a member of", async () => {
      const server = await setup();
      const { isError, text } = await callTool(server, "list_users", {
        tenant_id: "other",
      });
      expect(isError).toBe(true);
      expect(text).toBe('No access to tenant "other"');
    });

    it("surfaces missing permissions from the management API", async () => {
      const server = await setup();
      const { isError, text } = await callTool(server, "search_logs", {
        tenant_id: "acme",
      });
      expect(isError).toBe(true);
      expect(text).toMatch(/^403:/);
    });

    it("redacts secrets from results", async () => {
      const server = await setup();
      const { isError, text } = await callTool(server, "get_client", {
        tenant_id: "acme",
        client_id: "acme-app",
      });
      expect(isError).toBe(false);
      expect(text).not.toContain("super-secret-value");
      expect(JSON.parse(text).client_secret).toBe("[redacted]");
    });
  });

  describe("tenant host", () => {
    it("pins the tools to the host tenant", async () => {
      const server = await setup();
      const response = await post(
        server,
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { token: await mintToken(), host: "acme.localhost:3000" },
      );
      const body = await response.json();
      const tools: {
        name: string;
        inputSchema: { properties: Record<string, unknown> };
      }[] = body.result.tools;
      expect(tools.map((t) => t.name)).not.toContain("list_tenants");
      for (const tool of tools) {
        expect(tool.inputSchema.properties).not.toHaveProperty("tenant_id");
      }
    });

    it("reads the host tenant without a tenant_id argument", async () => {
      const server = await setup();
      const { isError, text } = await callTool(
        server,
        "list_users",
        {},
        { host: "acme.localhost:3000" },
      );
      expect(isError).toBe(false);
      expect(text).toContain("jane@acme.test");
    });

    it("ignores a tenant_id argument that differs from the host", async () => {
      const server = await setup();
      const { isError, text } = await callTool(
        server,
        "list_users",
        { tenant_id: "other" },
        { host: "acme.localhost:3000" },
      );
      expect(isError).toBe(false);
      expect(text).toContain("jane@acme.test");
    });

    it("refuses a tenant host the caller is not a member of", async () => {
      const server = await setup();
      const { isError, text } = await callTool(
        server,
        "list_users",
        {},
        { host: "other.localhost:3000" },
      );
      expect(isError).toBe(true);
      expect(text).toBe('No access to tenant "other"');
    });
  });
});
