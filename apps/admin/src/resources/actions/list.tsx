import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";

function TriggersCell() {
  const record = useRecordContext<{
    supported_triggers?: Array<{ id?: string }>;
  }>();
  if (!record?.supported_triggers?.length) return <>-</>;
  return <>{record.supported_triggers.map((t) => t.id).join(", ")}</>;
}

function SourceCell() {
  const record = useRecordContext<{ is_system?: boolean; inherit?: boolean }>();
  if (!record) return null;
  if (record.is_system) return <>system</>;
  if (record.inherit) return <>inherited</>;
  return <>local</>;
}

export function ActionList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="name" />
        <DataTable.Col label="Triggers">
          <TriggersCell />
        </DataTable.Col>
        <DataTable.Col label="Source">
          <SourceCell />
        </DataTable.Col>
        <DataTable.Col source="status" />
        <DataTable.Col source="runtime" />
        <DataTable.Col source="updated_at" />
      </DataTable>
    </List>
  );
}
