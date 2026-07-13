import {
  List,
  DataTable,
  TextInput,
  DateField,
  BooleanField,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Address } from "@authhero/adapter-interfaces";

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

function AddressCell() {
  const record = useRecordContext<{ address?: Address }>();
  const address = record?.address;
  if (!address) return null;
  return (
    address.formatted ||
    [
      address.street_address,
      address.postal_code,
      address.locality,
      address.region,
      address.country,
    ]
      .filter(Boolean)
      .join(", ")
  );
}

// Columns hidden by default; users opt in via the Columns selector.
const DEFAULT_HIDDEN_COLUMNS = [
  "user_id",
  "name",
  "username",
  "given_name",
  "family_name",
  "nickname",
  "email_verified",
  "provider",
  "locale",
  "birthdate",
  "address",
  "last_ip",
  "created_at",
  "updated_at",
];

export function UsersList() {
  return (
    <List filters={filters} sort={{ field: "user_id", order: "DESC" }}>
      <DataTable rowClick="edit" hiddenColumns={DEFAULT_HIDDEN_COLUMNS}>
        <DataTable.Col label="">
          <UserAvatarCell />
        </DataTable.Col>
        <DataTable.Col source="email" />
        <DataTable.Col source="phone_number" />
        <DataTable.Col source="connection" />
        <DataTable.Col source="login_count" />
        <DataTable.Col source="last_login" label="Last login" />
        <DataTable.Col source="user_id" label="User ID" />
        <DataTable.Col source="name" />
        <DataTable.Col source="username" />
        <DataTable.Col source="given_name" label="Given name" />
        <DataTable.Col source="family_name" label="Family name" />
        <DataTable.Col source="nickname" />
        <DataTable.Col source="email_verified" label="Email verified">
          <BooleanField source="email_verified" />
        </DataTable.Col>
        <DataTable.Col source="provider" />
        <DataTable.Col source="locale" />
        {/* birthdate and address are not in the adapters' ALLOWED_Q_FIELDS,
            so the API cannot sort on them */}
        <DataTable.Col source="birthdate" disableSort />
        <DataTable.Col source="address" disableSort>
          <AddressCell />
        </DataTable.Col>
        <DataTable.Col source="last_ip" label="Last IP" />
        <DataTable.Col source="created_at" label="Created">
          <DateField source="created_at" showTime />
        </DataTable.Col>
        <DataTable.Col source="updated_at" label="Updated">
          <DateField source="updated_at" showTime />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
