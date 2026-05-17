import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";

function ScopesCount() {
  const record = useRecordContext<{ scopes?: unknown[] }>();
  const n = record?.scopes?.length ?? 0;
  if (n === 0) return <>No scopes</>;
  return <>{`${n} scope${n === 1 ? "" : "s"}`}</>;
}

function OfflineAccess() {
  const record = useRecordContext<{ allow_offline_access?: boolean }>();
  return <>{record?.allow_offline_access ? "Yes" : "No"}</>;
}

function TokenLifetime() {
  const record = useRecordContext<{ token_lifetime?: number }>();
  return <>{`${record?.token_lifetime ?? 86400}s`}</>;
}

export function ResourceServerList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="name" />
        <DataTable.Col source="identifier" />
        <DataTable.Col label="Scopes">
          <ScopesCount />
        </DataTable.Col>
        <DataTable.Col label="Offline">
          <OfflineAccess />
        </DataTable.Col>
        <DataTable.Col label="Token lifetime">
          <TokenLifetime />
        </DataTable.Col>
        <DataTable.Col source="created_at" />
      </DataTable>
    </List>
  );
}
