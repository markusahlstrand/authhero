import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";

function ModeField() {
  const record = useRecordContext<{ action_id?: string }>();
  return <>{record?.action_id ? "Action" : "Verify JWT"}</>;
}

export function TokenExchangeProfileList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="name" />
        <DataTable.Col source="subject_token_type" label="Subject token type" />
        <DataTable.Col label="Mode">
          <ModeField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
