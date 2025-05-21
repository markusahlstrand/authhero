import { List, Datagrid, TextField, BooleanField } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function DomainList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="custom_domain_id" label="ID" />
        <TextField source="domain" />
        <TextField source="status" />
        <BooleanField source="primary" />
        <TextField source="type" />
      </Datagrid>
    </List>
  );
}
