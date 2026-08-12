// A thin HTTP wrapper so the vertical can be driven with curl. One route per
// operation; the caller's identity is the `x-principal` dev header — a dev seam,
// NOT a login. It must be replaced with real auth (Better Auth / an OIDC RP) before
// anything real is exposed. Harness code — exempt from the module-layer rules.
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scopeId, tenantId, type PrincipalId } from "@substrat-run/contracts";
import { seedWorld } from "./seed.js";
import { drainConsole } from "./platform-handlers.js";
import {
  CONSOLE_SCOPE,
  OPERATOR,
  PLATFORM_TENANT,
  principalByName,
} from "./constants.js";

const dir = await mkdtemp(join(tmpdir(), "authhero-console-server-"));
const { host, deps } = await seedWorld(dir);

const app = new Hono();

const principalOf = (c: Context): PrincipalId => {
  const name = c.req.header("x-principal") ?? "operator";
  const principal = principalByName.get(name);
  if (!principal)
    throw new Error(
      `unknown principal: ${name} (try operator | support | mallory | auth-core)`,
    );
  return principal;
};

const consoleStub = (principal: PrincipalId) =>
  host.getScope(principal, PLATFORM_TENANT, CONSOLE_SCOPE);

// Map an error to a status the way the kernel's fail-closed vocabulary reads.
function errorStatus(message: string): 403 | 404 | 400 {
  if (/permission denied|not entitled/i.test(message)) return 403;
  if (/unknown (scope|tenant|operation|feature)/i.test(message)) return 404;
  return 400;
}

const run = async (c: Context, work: () => Promise<unknown>) => {
  try {
    return c.json({ ok: true, data: await work() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, errorStatus(message));
  }
};

app.get("/tenants", (c) =>
  run(c, async () =>
    (await consoleStub(principalOf(c))).invoke("controlplane/list-tenants"),
  ),
);

// Mutating ops enqueue platform intents; drain them eagerly so self-serve signup
// isn't a spinner waiting for the sweep (the hosted analogue is an on-demand
// drain beside the periodic one). The op result is returned as-is — status stays
// honest ('provisioning' until the drain settles it).
app.post("/tenants", (c) =>
  run(c, async () => {
    const body = await c.req.json();
    const result = await (
      await consoleStub(principalOf(c))
    ).invoke("controlplane/register-tenant", body);
    await drainConsole(deps);
    return result;
  }),
);

app.post("/tenants/:tenantId/plan", (c) =>
  run(c, async () => {
    const body = await c.req.json();
    const result = await (
      await consoleStub(principalOf(c))
    ).invoke("controlplane/set-plan", {
      tenantId: c.req.param("tenantId"),
      plan: body.plan,
    });
    await drainConsole(deps);
    return result;
  }),
);

// The auth core's read-port, addressed by tenant slug for convenience. Resolves the
// customer's auth scope from the registry, then probes it as the request principal.
app.get("/tenants/:slug/features/:feature", (c) =>
  run(c, async () => {
    const principal = principalOf(c);
    // Resolve slug → auth scope from the registry as a trusted internal read
    // (host routing), then probe AS the caller so the entitlement check is theirs.
    const list = (await (
      await consoleStub(OPERATOR)
    ).invoke("controlplane/list-tenants")) as {
      slug: string;
      id: string;
      auth_scope_id: string;
    }[];
    const t = list.find((row) => row.slug === c.req.param("slug"));
    if (!t) throw new Error(`unknown tenant: ${c.req.param("slug")}`);
    const stub = await host.getScope(
      principal,
      tenantId.parse(t.id),
      scopeId.parse(t.auth_scope_id),
    );
    return stub.invoke("authcore/probe-feature", {
      feature: c.req.param("feature"),
    });
  }),
);

const port = Number(process.env.PORT ?? 8871);
serve({ fetch: app.fetch, port });
console.log(
  `authhero-console on http://localhost:${port}  (x-principal: operator | support | mallory | auth-core)`,
);
console.log(`console scope: ${PLATFORM_TENANT}/${CONSOLE_SCOPE}`);
