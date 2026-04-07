import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  TextInput,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";
import { getConfigValue } from "../../utils/runtimeConfig";

const filters = [
  <TextInput key="search" label="Search" source="q" alwaysOn />,
];

export function ClientList() {
  const restUrl = getConfigValue("apiUrl");
  return (
    <List actions={<PostListActions />} filters={filters}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="name" />
        <FunctionField
          label="Login"
          render={(record: any) => (
            <a
              href={`${restUrl}/authorize?client_id=${record.id}&redirect_uri=${restUrl}/u/info&scope=profile%20email%20openid&state=1234&response_type=code`}
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
