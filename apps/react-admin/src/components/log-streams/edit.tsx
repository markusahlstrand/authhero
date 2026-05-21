import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
  regex,
} from "react-admin";
import {
  contentFormatChoices,
  statusChoices,
  typeChoices,
} from "./logStreamConstants";

export function LogStreamEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} fullWidth />
        <SelectInput
          source="type"
          choices={typeChoices}
          validate={[required()]}
          disabled
          helperText="Type cannot be changed after creation"
        />
        <SelectInput
          source="status"
          choices={statusChoices}
          validate={[required()]}
        />
        <TextInput
          source="sink.http_endpoint"
          label="HTTP endpoint"
          validate={[
            required(),
            regex(/^https?:\/\/.+/, "Must be a valid http(s) URL"),
          ]}
          fullWidth
        />
        <TextInput
          source="sink.http_authorization"
          label="Authorization header"
          helperText='Sent verbatim as the Authorization header (e.g. "Basic …" or "Bearer …")'
          fullWidth
        />
        <TextInput source="sink.http_content_type" label="Content-Type" />
        <SelectInput
          source="sink.http_content_format"
          label="Content format"
          choices={contentFormatChoices}
        />
        <Labeled label={<FieldTitle source="created_at" />}>
          <DateField source="created_at" showTime />
        </Labeled>
        <Labeled label={<FieldTitle source="updated_at" />}>
          <DateField source="updated_at" showTime />
        </Labeled>
      </SimpleForm>
    </Edit>
  );
}
