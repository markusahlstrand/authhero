// AuthHero Console — thin M1 SPA, deliberately disposable (the real UI is the
// apps/admin repoint, Stage 5). Login: PKCE against AuthHero via auth0-spa-js
// (the same client apps/admin proves works against AuthHero). API: same-origin
// /op/controlplane/* + /me, Bearer-authenticated.
import { createAuth0Client, type Auth0Client } from "@auth0/auth0-spa-js";

interface AppConfig {
  issuer?: string;
  clientId?: string;
  audience?: string;
}
const config: AppConfig =
  (window as { __APP_CONFIG__?: AppConfig }).__APP_CONFIG__ ?? {};

interface Me {
  authenticated: boolean;
  principalId?: string;
  role?: string | null;
  email?: string | null;
}
interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  auth_scope_id: string;
  created_at: string;
}

const PLANS = ["free", "pro", "enterprise"];
const app = document.getElementById("app");
if (!app) throw new Error("no #app root");

const style = document.createElement("style");
style.textContent = `
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 18px; display: flex; align-items: center; gap: 10px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #26304a; color: #9db4e8; }
  .card { background: #171a21; border: 1px solid #262b36; border-radius: 10px; padding: 16px; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #262b36; }
  th { color: #8b93a5; font-weight: 500; font-size: 12px; }
  button, select, input { font: inherit; border-radius: 7px; border: 1px solid #333a48; background: #1e2330; color: #e6e6e6; padding: 6px 12px; }
  button { cursor: pointer; } button:hover { background: #26304a; }
  button.primary { background: #3554b3; border-color: #3554b3; } button.primary:hover { background: #4064d4; }
  .status-active { color: #7fd18a; } .status-provisioning { color: #e8c56d; } .status-failed { color: #e87d7d; }
  .muted { color: #8b93a5; } .err { color: #e87d7d; margin: 8px 0; white-space: pre-wrap; }
  form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
`;
document.head.appendChild(style);

let auth0: Auth0Client | null = null;
let getToken: () => Promise<string | null> = async () => null;

async function initAuth(): Promise<Me | null> {
  if (!config.issuer || !config.clientId) return null; // unconfigured — show setup note
  auth0 = await createAuth0Client({
    domain: config.issuer.replace(/\/$/, ""),
    clientId: config.clientId,
    authorizationParams: {
      redirect_uri: window.location.origin,
      ...(config.audience ? { audience: config.audience } : {}),
    },
  });
  if (location.search.includes("code=") && location.search.includes("state=")) {
    await auth0.handleRedirectCallback();
    history.replaceState({}, "", location.pathname);
  }
  if (!(await auth0.isAuthenticated())) return null;
  getToken = async () => {
    try {
      return await auth0!.getTokenSilently();
    } catch {
      return null;
    }
  };
  return fetchMe();
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    method: body === undefined && path === "/me" ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    result?: T;
    error?: string;
  } & T;
  if (path === "/me") return data as T;
  if (data.ok === false) throw new Error(data.error ?? `HTTP ${res.status}`);
  return (data.result ?? data) as T;
}

const fetchMe = async (): Promise<Me> => {
  const token = await getToken();
  const res = await fetch("/me", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { authenticated: false };
  return (await res.json()) as Me;
};

function render(html: string) {
  app!.innerHTML = html;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

async function showConsole(me: Me) {
  let tenants: TenantRow[] = [];
  let error = "";
  try {
    tenants = await api<TenantRow[]>("/op/controlplane/list-tenants", {});
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  render(`
    <div class="wrap">
      <h1>AuthHero Console <span class="badge">Substrat vertical</span></h1>
      <div class="card muted">
        Signed in as <b>${esc(me.email ?? "?")}</b>
        · principal <code>${esc(me.principalId ?? "?")}</code>
        · role <b>${esc(me.role ?? "none")}</b>
        <button id="logout" style="float:right">Sign out</button>
        ${
          me.role
            ? ""
            : `<p class="err">No role on this console scope yet — bootstrap it:
               <code>pnpm platform:local bootstrap ${esc(me.principalId ?? "&lt;principal&gt;")}</code></p>`
        }
      </div>
      ${error ? `<div class="err">${esc(error)}</div>` : ""}
      <div class="card">
        <h3 style="margin-top:0">Tenants</h3>
        <table>
          <tr><th>Slug</th><th>Name</th><th>Plan</th><th>Status</th><th></th></tr>
          ${tenants
            .map(
              (t) => `<tr>
            <td><code>${esc(t.slug)}</code></td>
            <td>${esc(t.name)}</td>
            <td><select data-plan="${esc(t.id)}">${PLANS.map((p) => `<option ${p === t.plan ? "selected" : ""}>${p}</option>`).join("")}</select></td>
            <td class="status-${esc(t.status)}">${esc(t.status)}</td>
            <td class="muted" style="font-size:11px">${esc(t.id.slice(0, 10))}…</td>
          </tr>`,
            )
            .join("")}
        </table>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Register tenant</h3>
        <form id="add">
          <input name="slug" placeholder="slug (e.g. acme)" required pattern="[a-z0-9-]+" />
          <input name="name" placeholder="Display name" required />
          <select name="plan">${PLANS.map((p) => `<option>${p}</option>`).join("")}</select>
          <button class="primary" type="submit">Provision</button>
        </form>
        <p class="muted" style="margin-bottom:0">Registers the tenant and enqueues a
        <code>provision-tenant</code> platform intent — it shows as <i>provisioning</i>
        until the platform drain settles it.</p>
      </div>
      <button id="refresh">Refresh</button>
    </div>
  `);

  document.getElementById("logout")?.addEventListener("click", () => {
    void auth0?.logout({ logoutParams: { returnTo: window.location.origin } });
  });
  document
    .getElementById("refresh")
    ?.addEventListener("click", () => void showConsole(me));
  document.getElementById("add")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target as HTMLFormElement);
    void (async () => {
      try {
        await api("/op/controlplane/register-tenant", {
          slug: fd.get("slug"),
          name: fd.get("name"),
          plan: fd.get("plan"),
        });
        await showConsole(me);
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
    })();
  });
  for (const sel of document.querySelectorAll<HTMLSelectElement>(
    "select[data-plan]",
  )) {
    sel.addEventListener("change", () => {
      void (async () => {
        try {
          await api("/op/controlplane/set-plan", {
            tenantId: sel.dataset.plan,
            plan: sel.value,
          });
          await showConsole(me);
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e));
        }
      })();
    });
  }
}

function showLogin(note?: string) {
  render(`
    <div class="wrap">
      <h1>AuthHero Console <span class="badge">Substrat vertical</span></h1>
      <div class="card">
        ${note ? `<p class="muted">${esc(note)}</p>` : ""}
        ${
          config.issuer && config.clientId
            ? `<button class="primary" id="login">Sign in with AuthHero</button>
               <p class="muted">Issuer: <code>${esc(config.issuer)}</code></p>`
            : `<p class="err">Not configured: OIDC_ISSUER / OIDC_CLIENT_ID missing.
               Point them at an AuthHero deployment (locally: the docker image with
               SEED=true, exactly like today's setup).</p>`
        }
      </div>
    </div>
  `);
  document.getElementById("login")?.addEventListener("click", () => {
    void auth0?.loginWithRedirect();
  });
}

void (async () => {
  try {
    const me = await initAuth();
    if (me?.authenticated) await showConsole(me);
    else
      showLogin(
        me
          ? "Signed in at the issuer, but this console does not recognize the account."
          : undefined,
      );
  } catch (e) {
    showLogin(e instanceof Error ? e.message : String(e));
  }
})();
