import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";

function renderTriggers(record: any): string {
  if (!record?.supported_triggers?.length) return "-";
  return record.supported_triggers.map((t: any) => t.id).join(", ");
}

export function ActionList() {
  return (
    <List actions={<PostListActions />}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" />
        <FunctionField label="Triggers" render={renderTriggers} />
        <TextField source="status" />
        <TextField source="runtime" />
        <DateField source="created_at" showTime />
        <DateField source="updated_at" showTime />
      </Datagrid>
    </List>
  );
}
