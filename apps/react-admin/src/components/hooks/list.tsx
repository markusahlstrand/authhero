import {
  List,
  Datagrid,
  TextField,
  BooleanField,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

function getHookType(record: any): string {
  if (record?.url) return "Webhook";
  if (record?.form_id) return "Form";
  if (record?.template_id) return "Template";
  if (record?.code_id) return "Code";
  return "—";
}

export function HookList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="hook_id" />
        <FunctionField label="Type" render={getHookType} />
        <TextField source="trigger_id" />
        <BooleanField source="enabled" />
        <BooleanField source="synchronous" />
      </Datagrid>
    </List>
  );
}
