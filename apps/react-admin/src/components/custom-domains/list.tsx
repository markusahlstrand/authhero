import { List, Datagrid, TextField, BooleanField, TextInput } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

const filters = [
  <TextInput key="search" label="Search" source="q" alwaysOn />,
];

export function DomainList() {
  return (
    <List actions={<PostListActions />} filters={filters}>
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
