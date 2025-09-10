import { List, Datagrid, TextField, DateField, TextInput } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function OrganizationList() {
  const filters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
  ];

  return (
    <List
      actions={<PostListActions />}
      filters={filters}
      sort={{ field: "name", order: "ASC" }}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="display_name" />
        <TextField source="description" />
        <DateField source="created_at" showTime={true} />
        <DateField source="updated_at" showTime={true} />
      </Datagrid>
    </List>
  );
}
