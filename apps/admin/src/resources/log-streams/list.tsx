import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";

function EndpointField() {
  const record = useRecordContext<{
    sink?: { http_endpoint?: string };
  }>();
  return <>{record?.sink?.http_endpoint ?? "—"}</>;
}

export function LogStreamsList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="name" />
        <DataTable.Col source="type" />
        <DataTable.Col source="status" />
        <DataTable.Col label="Endpoint">
          <EndpointField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
