import { List, DataTable } from "@/components/admin";

export function ConnectionsList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="id" />
        <DataTable.Col source="name" />
        <DataTable.Col source="strategy" />
        <DataTable.Col source="created_at" />
        <DataTable.Col source="updated_at" />
      </DataTable>
    </List>
  );
}
