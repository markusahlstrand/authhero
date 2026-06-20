import { useDataProvider, useRecordContext } from "ra-core";
import { List, DataTable } from "@/components/admin";
import { useTenantId } from "@/TenantContext";
import type { AuthHeroDataProvider } from "../../auth0DataProvider";

interface CustomDomainRecord {
  id: string;
  domain: string;
  primary?: boolean;
  status?: string;
}

function getTokenBaseUrl(tenantId: string): string {
  const tld = window.location.hostname.endsWith(".com") ? "com" : "dev";
  return `https://${tenantId}.token.sesamy.${tld}`;
}

function buildAuthorizeUrl(baseUrl: string, clientId: string): string {
  return `${baseUrl}/authorize?client_id=${clientId}&redirect_uri=${baseUrl}/u2/info&scope=profile%20email%20openid&state=1234&response_type=code&screen_hint=login`;
}

// Resolve the login base URL lazily, on click. Listing custom domains returns
// the stale DB row (status stays "pending" until something syncs it), whereas
// getOne hits the Cloudflare-backed path that refreshes status and writes back
// "ready" — so we only learn the real status by fetching the domain itself.
async function resolveCustomBaseUrl(
  dataProvider: AuthHeroDataProvider,
): Promise<string | null> {
  const { data } = await dataProvider.getList<CustomDomainRecord>(
    "custom-domains",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "domain", order: "ASC" },
      filter: {},
    },
  );
  const candidate = data.find((d) => d.primary) ?? data[0];
  if (!candidate) return null;

  const { data: fresh } = await dataProvider.getOne<CustomDomainRecord>(
    "custom-domains",
    { id: candidate.id },
  );
  return fresh.status === "ready" && fresh.domain
    ? `https://${fresh.domain}`
    : null;
}

function ClientLoginLink() {
  const record = useRecordContext<{ id: string }>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const tenantId = useTenantId();
  if (!record) return null;

  const clientId = record.id;

  const openLogin = async (win: Window | null) => {
    const fallback = tenantId ? getTokenBaseUrl(tenantId) : null;
    let baseUrl = fallback;
    try {
      const customBaseUrl = await resolveCustomBaseUrl(dataProvider);
      if (customBaseUrl) baseUrl = customBaseUrl;
    } catch {
      // Fall back to the token base URL if the domain lookup fails.
    }

    if (!baseUrl) {
      win?.close();
      return;
    }

    const url = buildAuthorizeUrl(baseUrl, clientId);
    if (win) win.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <a
      href={tenantId ? buildAuthorizeUrl(getTokenBaseUrl(tenantId), clientId) : "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Open synchronously so the popup blocker treats this as user-initiated,
        // then redirect once we've resolved the real base URL.
        const win = window.open("about:blank", "_blank");
        if (win) win.opener = null;
        void openLogin(win);
      }}
      className="text-primary underline"
    >
      Login
    </a>
  );
}

export function ClientList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="id" />
        <DataTable.Col source="name" />
        <DataTable.Col label="Login">
          <ClientLoginLink />
        </DataTable.Col>
        <DataTable.Col source="created_at" />
        <DataTable.Col source="updated_at" />
      </DataTable>
    </List>
  );
}
