import {
  DataTable,
  ListPagination,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import { useRecordContext } from "ra-core";

interface GrantRecord {
  id: string;
  clientID: string;
  audience?: string;
  scope?: string[];
}

function ScopeCell() {
  const record = useRecordContext<GrantRecord>();
  if (!record) return null;
  return <>{record.scope?.length ? record.scope.join(" ") : "-"}</>;
}

function AudienceCell() {
  const record = useRecordContext<GrantRecord>();
  if (!record) return null;
  return <>{record.audience || "-"}</>;
}

export function GrantsTab() {
  return (
    <ReferenceManyField
      reference="grants"
      target="user_id"
      perPage={10}
      pagination={<ListPagination />}
      empty={
        <p className="text-sm text-muted-foreground py-4">
          No OAuth grants
        </p>
      }
    >
      <DataTable rowClick={false} bulkActionButtons={false}>
        <DataTable.Col label="Client">
          <TextField source="clientID" />
        </DataTable.Col>
        <DataTable.Col label="Audience">
          <AudienceCell />
        </DataTable.Col>
        <DataTable.Col label="Granted scope">
          <ScopeCell />
        </DataTable.Col>
      </DataTable>
    </ReferenceManyField>
  );
}
