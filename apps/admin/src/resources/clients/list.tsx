import { useRecordContext } from "ra-core";
import { List, DataTable } from "@/components/admin";
import { useTenantId } from "@/TenantContext";

function getTokenBaseUrl(tenantId: string): string {
  const tld = window.location.hostname.endsWith(".com") ? "com" : "dev";
  return `https://${tenantId}.token.sesamy.${tld}`;
}

function ClientLoginLink({ baseUrl }: { baseUrl: string }) {
  const record = useRecordContext<{ id: string }>();
  if (!record) return null;
  return (
    <a
      href={`${baseUrl}/authorize?client_id=${record.id}&redirect_uri=${baseUrl}/u/info&scope=profile%20email%20openid&state=1234&response_type=code`}
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
  const baseUrl = tenantId ? getTokenBaseUrl(tenantId) : null;

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
