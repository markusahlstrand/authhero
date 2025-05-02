import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

export function ApplicationsList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="name" />
        <FunctionField
          label="Login"
          render={(record: any) => (
            <a
              href={`${
                import.meta.env.VITE_SIMPLE_REST_URL
              }/authorize?client_id=${record.id}&redirect_uri=${
                import.meta.env.VITE_SIMPLE_REST_URL
              }/u/info&scope=profile%20email%20openid&state=1234&response_type=code`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Login
            </a>
          )}
        />
        <DateField source="created_at" showTime={true} />
        <DateField source="updated_at" showTime={true} />
      </Datagrid>
    </List>
  );
}
