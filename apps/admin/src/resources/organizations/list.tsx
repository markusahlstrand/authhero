import { List, DataTable } from "@/components/admin";

export function OrganizationList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="id" />
        <DataTable.Col source="name" />
        <DataTable.Col source="display_name" />
        <DataTable.Col source="description" />
        <DataTable.Col source="created_at" />
      </DataTable>
    </List>
  );
}
