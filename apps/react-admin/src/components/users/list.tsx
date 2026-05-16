import {
  List,
  Datagrid,
  TextField,
  EmailField,
  TextInput,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";
import { DateAgo } from "../common";

export function UsersList() {
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
    <TextInput key="email" label="Email" source="email" />,
    <TextInput key="name" label="Name" source="name" />,
    <TextInput key="connection" label="Connection" source="connection" />,
    <TextInput
      key="phone_number"
      label="Phone number"
      source="phone_number"
    />,
  ];

  return (
    <List
      actions={<PostListActions />}
      filters={postFilters}
      sort={{ field: "user_id", order: "DESC" }}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EmailField source="email" />
        <TextField source="phone_number" />
        <TextField source="connection" />
        <TextField source="login_count" />
        <FunctionField
          label="Last login"
          render={(record: any) => <DateAgo date={record.last_login} />}
        />
      </Datagrid>
    </List>
  );
}
