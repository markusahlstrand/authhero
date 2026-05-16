import { List, DataTable } from "@/components/admin";

export function SigningKeysList() {
  return (
    <List sort={{ field: "created_at", order: "DESC" }}>
      <DataTable rowClick={false}>
        <DataTable.Col source="kid" label="Key ID" />
        <DataTable.Col source="type" label="Type" />
        <DataTable.Col source="alg" label="Algorithm" />
        <DataTable.Col source="created_at" />
        <DataTable.Col source="revoked_at" />
      </DataTable>
    </List>
  );
}
