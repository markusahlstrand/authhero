import {
  Edit,
  SimpleForm,
  TextInput,
  BooleanInput,
} from "@/components/admin";

export function UserEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="user_id" readOnly />
        <TextInput source="email" type="email" />
        <BooleanInput source="email_verified" />
        <TextInput source="phone_number" />
        <BooleanInput source="phone_verified" />
        <TextInput source="name" />
        <TextInput source="given_name" />
        <TextInput source="family_name" />
        <TextInput source="nickname" />
        <TextInput source="picture" />
        <TextInput source="connection" readOnly />
        <BooleanInput source="blocked" />

        <TextInput
          source="user_metadata"
          label="User metadata (JSON)"
          multiline
          format={(v: unknown) =>
            v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2)
          }
          parse={(v: string) => {
            if (!v?.trim()) return {};
            try {
              return JSON.parse(v);
            } catch {
              return v;
            }
          }}
        />

        <TextInput
          source="app_metadata"
          label="App metadata (JSON)"
          multiline
          format={(v: unknown) =>
            v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2)
          }
          parse={(v: string) => {
            if (!v?.trim()) return {};
            try {
              return JSON.parse(v);
            } catch {
              return v;
            }
          }}
        />
      </SimpleForm>
    </Edit>
  );
}
