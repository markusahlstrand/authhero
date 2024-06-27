import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  SimpleForm,
  TextInput,
} from "react-admin";

export function DomainEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="domain" />
        <SelectInput
          source="email_service"
          choices={[
            { id: "mailchannels", name: "Mailchannels" },
            { id: "mailgun", name: "Mailgun" },
          ]}
        />
        <TextInput
          label="PEM Private Key"
          source="dkim_private_key"
          style={{ width: "800px" }}
          multiline={true}
        />
        <TextInput
          label="PEM Public Key"
          source="dkim_public_key"
          style={{ width: "800px" }}
          multiline={true}
        />
        <TextInput
          label="Api Key"
          source="email_api_key"
          style={{ width: "800px" }}
        />
        <Labeled label={<FieldTitle source="created_at" />}>
          <DateField source="created_at" showTime={true} />
        </Labeled>
        <Labeled label={<FieldTitle source="updated_at" />}>
          <DateField source="updated_at" showTime={true} />
        </Labeled>
      </SimpleForm>
    </Edit>
  );
}
