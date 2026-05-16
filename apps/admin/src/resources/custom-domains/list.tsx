import { List, DataTable } from "@/components/admin";

export function DomainList() {
  return (
    <List>
      <DataTable rowClick="edit">
        <DataTable.Col source="custom_domain_id" label="ID" />
        <DataTable.Col source="domain" />
        <DataTable.Col source="status" />
        <DataTable.Col source="primary" />
        <DataTable.Col source="type" />
      </DataTable>
    </List>
  );
}
