import { List, DataTable, TextInput } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const filters = [
  <TextInput key="email" source="email" label="Email" />,
  <TextInput key="name" source="name" label="Name" />,
  <TextInput key="connection" source="connection" label="Connection" />,
  <TextInput key="phone_number" source="phone_number" label="Phone number" />,
];

function UserAvatarCell() {
  const record = useRecordContext<{
    picture?: string;
    email?: string;
    name?: string;
    user_id?: string;
  }>();
  if (!record) return null;
  const label = record.email || record.name || "";
  // authhero always returns a `picture` (a generated avatar when the user has
  // none), so we render it directly; the fallback only covers a failed load.
  return (
    <Avatar>
      <AvatarImage src={record.picture} alt={label} />
      <AvatarFallback>{label.charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

export function UsersList() {
  return (
    <List filters={filters} sort={{ field: "user_id", order: "DESC" }}>
      <DataTable rowClick="edit">
        <DataTable.Col label="">
          <UserAvatarCell />
        </DataTable.Col>
        <DataTable.Col source="email" />
        <DataTable.Col source="phone_number" />
        <DataTable.Col source="connection" />
        <DataTable.Col source="login_count" />
        <DataTable.Col source="last_login" label="Last login" />
      </DataTable>
    </List>
  );
}
