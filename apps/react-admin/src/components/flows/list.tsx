import { List, Datagrid, TextField, DateField } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export const FlowsList = () => {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="name" />
        <DateField source="created_at" showTime={true} />
        <DateField source="updated_at" showTime={true} />
      </Datagrid>
    </List>
  );
};
