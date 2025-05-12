import { List, Datagrid, TextField, TextInput } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function SessionsList() {
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
  ];

  return (
    <List
      actions={<PostListActions />}
      filters={postFilters}
      sort={{ field: "date", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick="show">
        <TextField source="description" />
      </Datagrid>
    </List>
  );
}
