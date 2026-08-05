// The LOCAL platform driver — a stand-in for Substrat's platform against the two
// wrangler-dev workers, speaking only the real wire surfaces:
//
//   console  :8788  /internal/provision · /internal/platform-requests(+/settle)
//   authcore :8789  /internal/provision · /internal/probe
//
// It does exactly what the hosted platform will do (docs/provisioning-capability.md
// §8): pull the console scope's pending intents, effect each with "platform
// authority" (here: HTTP to the target vertical), settle the outcome back. It is
// therefore ALSO a reference for the platform-side handlers, one level up from
// src/platform-handlers.ts (which effects in-process against the CP-full host).
//
//   pnpm platform:local bootstrap <sub-or-principal>   provision the console scope,
//                                                      owner = the given login
//   pnpm platform:local drain                          drain loop (2s poll)
//   pnpm platform:local                                bootstrap-if-owner-given + drain
import { principalId as principalIdOf } from "@substrat-run/contracts";
import { principalForSub } from "../src/identity.js";
import {
  PROVISION_TENANT_KIND,
  SET_ENTITLEMENTS_KIND,
  provisionTenantPayload,
  setEntitlementsPayload,
} from "../src/intents.js";
import { AUTHCORE_ENTITLEMENT } from "../src/policy.js";

const CONSOLE_URL = process.env.CONSOLE_URL ?? "http://localhost:8788";
const AUTHCORE_URL = process.env.AUTHCORE_URL ?? "http://localhost:8789";
const SECRET = process.env.PLATFORM_SECRET ?? "devsecret";

// Deterministic, human-legible ULIDs for the local console node (the hosted
// analogue is the directory row + router assertion; locally these are also what
// you pass as x-tenant / x-scope with ALLOW_DEV_HEADER).
const fixed = (tag: string): string =>
  ("0AH" + tag.toUpperCase())
    .replace(/[ILOU]/g, "0")
    .concat("0".repeat(26))
    .slice(0, 26);
export const CONSOLE_TENANT = fixed("CONSOLETENANT");
export const CONSOLE_SCOPE = fixed("CONSOLESCOPE");

const platformHeaders = {
  "x-substrat-platform": SECRET,
  "content-type": "application/json",
};

async function call(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(`${path} → HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const entitlementRow = (key: string, plan: string | null) => ({
  entitlementKey: key,
  expiresAt: null,
  quota: null,
  plan,
  grantedAt: null,
  grantedBy: null,
});

async function bootstrap(subOrPrincipal: string): Promise<void> {
  const parsed = principalIdOf.safeParse(subOrPrincipal);
  const owner = parsed.success ? parsed.data : principalForSub(subOrPrincipal);
  await call(CONSOLE_URL, "/internal/provision", {
    method: "POST",
    headers: platformHeaders,
    body: JSON.stringify({
      tenantId: CONSOLE_TENANT,
      scopeId: CONSOLE_SCOPE,
      owner,
      slug: "console",
      name: "AuthHero Console",
      entitlements: [entitlementRow("authhero-console", null)],
    }),
  });
  console.log(`bootstrap: console scope ${CONSOLE_TENANT}/${CONSOLE_SCOPE}`);
  console.log(`bootstrap: owner ${owner} → platform-operator`);
}

interface IntentRow {
  id: string;
  kind: string;
  status: string;
  payload: unknown;
}

async function drainOnce(): Promise<number> {
  const pending = (await call(
    CONSOLE_URL,
    `/internal/platform-requests?tenantId=${CONSOLE_TENANT}&scopeId=${CONSOLE_SCOPE}`,
    { headers: platformHeaders },
  )) as IntentRow[];

  for (const intent of pending) {
    const settle = async (
      status: "done" | "failed" | "pending",
      extra: Record<string, unknown>,
    ) =>
      call(CONSOLE_URL, "/internal/platform-requests/settle", {
        method: "POST",
        headers: platformHeaders,
        body: JSON.stringify({
          tenantId: CONSOLE_TENANT,
          scopeId: CONSOLE_SCOPE,
          id: intent.id,
          status,
          ...extra,
        }),
      });

    try {
      if (intent.kind === PROVISION_TENANT_KIND) {
        const p = provisionTenantPayload.parse(intent.payload);
        // The hosted handler also enforces §8.2 here (provisioner capability,
        // declared vertical, declared SKUs, provisionedBy) — locally we trust
        // the single console.
        await call(AUTHCORE_URL, "/internal/provision", {
          method: "POST",
          headers: platformHeaders,
          body: JSON.stringify({
            tenantId: p.tenant.id,
            scopeId: p.instance.scopeId,
            owner: p.instance.owner,
            slug: p.instance.slug,
            name: p.instance.name,
            entitlements: [
              entitlementRow(AUTHCORE_ENTITLEMENT, null),
              ...p.entitlements.map((e) => entitlementRow(e.key, e.plan)),
            ],
          }),
        });
        await settle("done", {
          result: { tenantId: p.tenant.id, scopeId: p.instance.scopeId },
        });
        console.log(
          `drained ${intent.id}: provision-tenant '${p.tenant.slug}' → done`,
        );
      } else if (intent.kind === SET_ENTITLEMENTS_KIND) {
        const p = setEntitlementsPayload.parse(intent.payload);
        // Re-provision = full re-projection (#310 DELETE-then-INSERT), so a
        // downgrade revokes cleanly. Owner/roles unchanged — idempotent.
        await call(AUTHCORE_URL, "/internal/provision", {
          method: "POST",
          headers: platformHeaders,
          body: JSON.stringify({
            tenantId: p.tenantId,
            scopeId: p.authScopeId,
            owner: fixed("REPROJECT"), // provision requires an owner; role re-grant is idempotent
            slug: `tenant-${p.tenantId.slice(-6).toLowerCase()}`,
            name: "reprojected",
            entitlements: [
              entitlementRow(AUTHCORE_ENTITLEMENT, null),
              ...p.entitlements.map((e) => entitlementRow(e.key, e.plan)),
            ],
          }),
        });
        await settle("done", {
          result: { tenantId: p.tenantId, plan: p.plan },
        });
        console.log(
          `drained ${intent.id}: set-entitlements plan='${p.plan}' → done`,
        );
      } else {
        await settle("failed", {
          lastError: `unknown intent kind: ${intent.kind}`,
        });
        console.log(
          `drained ${intent.id}: unknown kind '${intent.kind}' → failed`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await settle("pending", { lastError: message }).catch(() => {});
      console.log(
        `drained ${intent.id}: ${intent.kind} → pending (${message})`,
      );
    }
  }
  return pending.length;
}

const [, , command, arg] = process.argv;

if (command === "bootstrap") {
  if (!arg)
    throw new Error("usage: platform:local bootstrap <sub-or-principal>");
  await bootstrap(arg);
} else {
  if (command && command !== "drain")
    throw new Error(`unknown command: ${command}`);
  console.log(
    `local platform: draining ${CONSOLE_URL} → ${AUTHCORE_URL} every 2s (ctrl-c to stop)`,
  );
  for (;;) {
    try {
      await drainOnce();
    } catch (err) {
      console.log(
        `drain error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
