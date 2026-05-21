import {
  Create,
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

export function LogStreamCreate() {
  return (
    <Create
      transform={(data: any) => ({
        ...data,
        status: data.status ?? "active",
        sink: {
          http_endpoint: data?.sink?.http_endpoint,
          http_authorization: data?.sink?.http_authorization,
          http_content_type: data?.sink?.http_content_type || "application/json",
          http_content_format: data?.sink?.http_content_format || "JSONARRAY",
        },
      })}
    >
      <SimpleForm defaultValues={{ type: "http", status: "active" }}>
        <TextInput source="name" validate={[required()]} fullWidth />
        <SelectInput
          source="type"
          choices={typeChoices}
          validate={[required()]}
          helperText="Only HTTP sinks are currently delivered by AuthHero"
        />
        <SelectInput source="status" choices={statusChoices} />
        <TextInput
          source="sink.http_endpoint"
          label="HTTP endpoint"
          validate={[
            required(),
            regex(/^https?:\/\/[^\s]+$/i, "Must be a valid http(s) URL"),
          ]}
          fullWidth
        />
        <TextInput
          source="sink.http_authorization"
          label="Authorization header"
          helperText='Sent verbatim as the Authorization header (e.g. "Basic …" or "Bearer …")'
          fullWidth
        />
        <TextInput
          source="sink.http_content_type"
          label="Content-Type"
          defaultValue="application/json"
        />
        <SelectInput
          source="sink.http_content_format"
          label="Content format"
          choices={contentFormatChoices}
          defaultValue="JSONARRAY"
        />
      </SimpleForm>
    </Create>
  );
}
