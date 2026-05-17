import {
  Edit,
  SimpleForm,
  TextInput,
} from "@/components/admin";

export function SessionEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="user_id" readOnly />
        <TextInput source="device.last_ip" label="Last IP" readOnly />
        <TextInput source="device.last_user_agent" label="Last user agent" readOnly />
        <TextInput source="device.initial_ip" label="Initial IP" readOnly />
        <TextInput source="device.initial_user_agent" label="Initial user agent" readOnly />
      </SimpleForm>
    </Edit>
  );
}
