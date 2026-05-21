import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
} from "@/components/admin";
import { regex, required } from "ra-core";
import {
  contentFormatChoices,
  statusChoices,
  typeChoices,
} from "./logStreamConstants";

export function LogStreamEdit() {
  return (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
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
            regex(/^https?:\/\/[^\s]+$/i, "Must be a valid http(s) URL"),
          ]}
        />
        <TextInput
          source="sink.http_authorization"
          label="Authorization header"
          helperText='Sent verbatim as the Authorization header (e.g. "Basic …" or "Bearer …")'
        />
        <TextInput source="sink.http_content_type" label="Content-Type" />
        <SelectInput
          source="sink.http_content_format"
          label="Content format"
          choices={contentFormatChoices}
        />
      </SimpleForm>
    </Edit>
  );
}
