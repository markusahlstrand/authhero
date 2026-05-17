import {
  Show,
  SimpleShowLayout,
  RecordField,
  TextField,
  DateField,
} from "@/components/admin";
import { JsonOutput } from "@/common/JsonOutput";
import { useRecordContext } from "ra-core";

function RawJson() {
  const record = useRecordContext();
  if (!record) return null;
  return <JsonOutput data={record} />;
}

export function LogShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="id">
          <TextField source="id" />
        </RecordField>
        <RecordField source="tenant_id">
          <TextField source="tenant_id" />
        </RecordField>
        <RecordField source="user_name">
          <TextField source="user_name" />
        </RecordField>
        <RecordField source="description">
          <TextField source="description" />
        </RecordField>
        <RecordField source="client_id">
          <TextField source="client_id" />
        </RecordField>
        <RecordField source="client_name">
          <TextField source="client_name" />
        </RecordField>
        <RecordField source="user_agent">
          <TextField source="user_agent" />
        </RecordField>
        <RecordField source="ip">
          <TextField source="ip" />
        </RecordField>
        <RecordField source="type">
          <TextField source="type" />
        </RecordField>
        <RecordField source="date">
          <DateField source="date" showTime />
        </RecordField>
        <RecordField source="connection">
          <TextField source="connection" />
        </RecordField>
        <RecordField source="strategy">
          <TextField source="strategy" />
        </RecordField>
        <RecordField source="hostname">
          <TextField source="hostname" />
        </RecordField>
        <RecordField source="audience">
          <TextField source="audience" />
        </RecordField>
        <RecordField source="scope">
          <TextField source="scope" />
        </RecordField>
        <RecordField label="Raw">
          <RawJson />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
