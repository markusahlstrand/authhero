import { List, DataTable } from "@/components/admin";

export function RoleList() {
  return (
    <List sort={{ field: "name", order: "ASC" }}>
      <DataTable rowClick="edit">
        <DataTable.Col source="id" />
        <DataTable.Col source="name" />
        <DataTable.Col source="description" />
        <DataTable.Col source="created_at" />
      </DataTable>
    </List>
  );
}
