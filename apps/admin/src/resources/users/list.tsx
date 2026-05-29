import { List, DataTable, TextInput } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserAvatarColor, getUserAvatarSeed } from "@/utils/userAvatar";

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
  const seed = getUserAvatarSeed(record);
  const initial = seed.charAt(0).toUpperCase();
  const bg = getUserAvatarColor(seed);
  return (
    <Avatar>
      {record.picture ? (
        <AvatarImage src={record.picture} alt={record.email || record.name} />
      ) : null}
      <AvatarFallback style={{ backgroundColor: bg, color: "white" }}>
        {initial}
      </AvatarFallback>
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
