import { useGetList, useRecordContext } from "ra-core";
import { List, DataTable } from "@/components/admin";
import { useTenantId } from "@/TenantContext";

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

function pickCustomDomain(
  domains: CustomDomainRecord[] | undefined,
): string | null {
  if (!domains) return null;
  const ready = domains.filter((d) => d.status === "ready");
  const chosen = ready.find((d) => d.primary) ?? ready[0];
  return chosen ? `https://${chosen.domain}` : null;
}

function ClientLoginLink({ baseUrl }: { baseUrl: string }) {
  const record = useRecordContext<{ id: string }>();
  if (!record) return null;
  return (
    <a
      href={`${baseUrl}/authorize?client_id=${record.id}&redirect_uri=${baseUrl}/u2/info&scope=profile%20email%20openid&state=1234&response_type=code&screen_hint=login`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-primary underline"
    >
      Login
    </a>
  );
}

export function ClientList() {
  const tenantId = useTenantId();
  const { data: customDomains } = useGetList<CustomDomainRecord>(
    "custom-domains",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "domain", order: "ASC" },
    },
  );
  const customBaseUrl = pickCustomDomain(customDomains);
  const baseUrl =
    customBaseUrl ?? (tenantId ? getTokenBaseUrl(tenantId) : null);

  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="id" />
        <DataTable.Col source="name" />
        <DataTable.Col label="Login">
          {baseUrl ? <ClientLoginLink baseUrl={baseUrl} /> : null}
        </DataTable.Col>
        <DataTable.Col source="created_at" />
        <DataTable.Col source="updated_at" />
      </DataTable>
    </List>
  );
}
