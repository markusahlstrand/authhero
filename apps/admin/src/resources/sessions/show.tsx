import {
  Show,
  SimpleShowLayout,
  RecordField,
  TextField,
  DateField,
  ReferenceField,
} from "@/components/admin";

export function SessionShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <RecordField source="id">
          <TextField source="id" />
        </RecordField>
        <RecordField source="user_id">
          <ReferenceField source="user_id" reference="users" link="show">
            <TextField source="email" />
          </ReferenceField>
        </RecordField>
        <RecordField source="created_at">
          <DateField source="created_at" showTime />
        </RecordField>
        <RecordField source="used_at">
          <DateField source="used_at" showTime />
        </RecordField>
        <RecordField source="expires_at">
          <DateField source="expires_at" showTime />
        </RecordField>
        <RecordField source="idle_expires_at">
          <DateField source="idle_expires_at" showTime />
        </RecordField>
        <RecordField source="device.last_ip" label="Last IP">
          <TextField source="device.last_ip" />
        </RecordField>
        <RecordField source="device.last_user_agent" label="Last user agent">
          <TextField source="device.last_user_agent" />
        </RecordField>
      </SimpleShowLayout>
    </Show>
  );
}
