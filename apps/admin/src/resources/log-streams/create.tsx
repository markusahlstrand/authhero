import {
  Create,
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

type LogStreamFormValues = {
  status?: string;
  sink?: {
    http_endpoint?: string;
    http_authorization?: string;
    http_content_type?: string;
    http_content_format?: string;
  };
};

export function LogStreamCreate() {
  return (
    <Create
      transform={(data: LogStreamFormValues) => ({
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
        <TextInput source="name" validate={[required()]} />
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
        />
        <TextInput
          source="sink.http_authorization"
          label="Authorization header"
          helperText='Sent verbatim as the Authorization header (e.g. "Basic …" or "Bearer …")'
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
