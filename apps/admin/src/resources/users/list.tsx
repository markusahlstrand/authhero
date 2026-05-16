import { List, DataTable } from "@/components/admin";

export function UsersList() {
  return (
    <List sort={{ field: "user_id", order: "DESC" }}>
      <DataTable rowClick="edit">
        <DataTable.Col source="email" />
        <DataTable.Col source="phone_number" />
        <DataTable.Col source="connection" />
        <DataTable.Col source="login_count" />
        <DataTable.Col source="last_login" label="Last login" />
      </DataTable>
    </List>
  );
}
