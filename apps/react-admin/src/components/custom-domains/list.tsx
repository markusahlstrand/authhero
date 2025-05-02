import { List, Datagrid, TextField, DateField } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function DomainList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="domain" />
        <DateField source="created_at" showTime={true} />
        <DateField source="updated_at" showTime={true} />
      </Datagrid>
    </List>
  );
}
