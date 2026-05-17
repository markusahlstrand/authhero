import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";

function HookType() {
  const record = useRecordContext<{
    url?: string;
    form_id?: string;
    template_id?: string;
    code_id?: string;
  }>();
  if (!record) return null;
  if (record.url) return <>Webhook</>;
  if (record.form_id) return <>Form</>;
  if (record.template_id) return <>Template</>;
  if (record.code_id) return <>Code</>;
  return <>—</>;
}

export function HookList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="hook_id" />
        <DataTable.Col label="Type">
          <HookType />
        </DataTable.Col>
        <DataTable.Col source="trigger_id" />
        <DataTable.Col source="enabled" />
        <DataTable.Col source="synchronous" />
        <DataTable.Col source="priority" />
      </DataTable>
    </List>
  );
}
