import {
  DataTable,
  DateField,
  ListPagination,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import { useRecordContext } from "ra-core";

interface ConsentRecord {
  id: string;
  client_id: string;
  scopes?: string[];
  created_at?: string;
  updated_at?: string;
}

function ScopesCell() {
  const record = useRecordContext<ConsentRecord>();
  if (!record) return null;
  return <>{record.scopes?.length ? record.scopes.join(" ") : "-"}</>;
}

export function ConsentsTab() {
  return (
    <ReferenceManyField
      reference="consents"
      target="user_id"
      sort={{ field: "created_at", order: "DESC" }}
      perPage={10}
      pagination={<ListPagination />}
      empty={
        <p className="text-sm text-muted-foreground py-4">
          No OAuth consents granted
        </p>
      }
    >
      <DataTable rowClick={false} bulkActionButtons={false}>
        <DataTable.Col label="Client">
          <TextField source="client_id" />
        </DataTable.Col>
        <DataTable.Col label="Granted scopes">
          <ScopesCell />
        </DataTable.Col>
        <DataTable.Col label="Granted at">
          <DateField source="created_at" showTime />
        </DataTable.Col>
        <DataTable.Col label="Updated at">
          <DateField source="updated_at" showTime />
        </DataTable.Col>
      </DataTable>
    </ReferenceManyField>
  );
}
