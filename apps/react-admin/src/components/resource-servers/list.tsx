import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  CreateButton,
  TopToolbar,
} from "react-admin";

const ResourceServerActions = () => (
  <TopToolbar>
    <CreateButton />
  </TopToolbar>
);

export function ResourceServerList() {
  return (
    <List actions={<ResourceServerActions />}>
      <Datagrid rowClick="edit">
        <TextField source="name" />
        <TextField source="identifier" />
        <FunctionField
          source="scopes"
          label="Scopes"
          render={(record: any) => {
            if (!record.scopes || record.scopes.length === 0) {
              return "No scopes";
            }
            return `${record.scopes.length} scope${record.scopes.length === 1 ? "" : "s"}`;
          }}
        />
        <FunctionField
          source="allow_offline_access"
          label="Offline Access"
          render={(record: any) => (record.allow_offline_access ? "Yes" : "No")}
        />
        <FunctionField
          source="token_lifetime"
          label="Token Lifetime"
          render={(record: any) => `${record.token_lifetime || 86400}s`}
        />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  );
}
