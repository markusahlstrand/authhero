import { List, Datagrid, TextField, BooleanField } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function HookList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="trigger_id" />
        <TextField source="url" />
        <BooleanField source="enabled" />
        <BooleanField source="synchronous" />
      </Datagrid>
    </List>
  );
}
