import {
  DataTable,
  DateField,
  ListPagination,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import { useRecordContext } from "ra-core";

interface SessionRecord {
  id: string;
  used_at?: string;
  idle_expires_at?: string;
  created_at?: string;
  revoked_at?: string | null;
  clients?: string[];
  device?: {
    last_ip?: string;
    last_user_agent?: string;
  };
}

function ClientsCell() {
  const record = useRecordContext<SessionRecord>();
  if (!record) return null;
  return <>{record.clients?.length ? record.clients.join(", ") : "-"}</>;
}

function StatusCell() {
  const record = useRecordContext<SessionRecord>();
  if (!record) return null;
  return <>{record.revoked_at ? "Revoked" : "Active"}</>;
}

export function SessionsTab() {
  return (
    <ReferenceManyField
      reference="sessions"
      target="user_id"
      sort={{ field: "used_at", order: "DESC" }}
      perPage={10}
      pagination={<ListPagination />}
      empty={
        <p className="text-sm text-muted-foreground py-4">
          No active sessions found
        </p>
      }
    >
      <DataTable rowClick="edit" bulkActionButtons={false}>
        <DataTable.Col source="id" />
        <DataTable.Col label="Used at">
          <DateField source="used_at" showTime empty="-" />
        </DataTable.Col>
        <DataTable.Col label="Idle expires at">
          <DateField source="idle_expires_at" showTime />
        </DataTable.Col>
        <DataTable.Col label="IP">
          <TextField source="device.last_ip" empty="-" />
        </DataTable.Col>
        <DataTable.Col label="User Agent">
          <TextField source="device.last_user_agent" empty="-" />
        </DataTable.Col>
        <DataTable.Col label="Client IDs">
          <ClientsCell />
        </DataTable.Col>
        <DataTable.Col label="Created at">
          <DateField source="created_at" showTime />
        </DataTable.Col>
        <DataTable.Col label="Status">
          <StatusCell />
        </DataTable.Col>
      </DataTable>
    </ReferenceManyField>
  );
}
