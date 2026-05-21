import {
  List,
  Datagrid,
  TextField,
  FunctionField,
  ChipField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function LogStreamsList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" />
        <ChipField source="type" />
        <ChipField source="status" />
        <FunctionField
          label="Endpoint"
          render={(record: any) => record?.sink?.http_endpoint ?? "—"}
        />
      </Datagrid>
    </List>
  );
}
