import { List, Datagrid, TextField, DateField } from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export const FormsList = () => {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="name" />
        <TextField source="type" />
        <DateField source="created_at" showTime={true} />
        <DateField source="updated_at" showTime={true} />
      </Datagrid>
    </List>
  );
};
