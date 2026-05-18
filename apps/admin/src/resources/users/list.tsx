import { List, DataTable, TextInput } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const filters = [
  <TextInput key="email" source="email" label="Email" />,
  <TextInput key="name" source="name" label="Name" />,
  <TextInput key="connection" source="connection" label="Connection" />,
  <TextInput
    key="phone_number"
    source="phone_number"
    label="Phone number"
  />,
];

const AVATAR_COLORS = [
  "#1F77B4",
  "#FF7F0E",
  "#2CA02C",
  "#D62728",
  "#9467BD",
  "#8C564B",
  "#E377C2",
  "#17BECF",
  "#BCBD22",
  "#7F7F7F",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function UserAvatarCell() {
  const record = useRecordContext<{
    picture?: string;
    email?: string;
    name?: string;
    user_id?: string;
  }>();
  if (!record) return null;
  const seed = record.email || record.name || record.user_id || "?";
  const initial = seed.charAt(0).toUpperCase();
  const bg = AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
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
