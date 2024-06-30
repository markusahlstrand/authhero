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
  ];

  return (
    <List actions={<PostListActions />} filters={postFilters}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <EmailField source="email" />
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
