import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";

const triggerChoices = [
  { id: "post-login", name: "Post Login" },
  { id: "credentials-exchange", name: "Credentials Exchange" },
  { id: "pre-user-registration", name: "Pre User Registration" },
  { id: "post-user-registration", name: "Post User Registration" },
];

export function ActionEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" required />
        <SelectInput source="trigger_id" label="Trigger" choices={triggerChoices} />
        <TextInput
          source="code"
          multiline
          inputClassName="font-mono text-sm"
        />
        <TextInput source="runtime" />
        <BooleanInput source="is_system" label="System action" />
        <BooleanInput source="inherit" label="Inherit" />

        <ArrayInput source="secrets" label="Secrets">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Name" />
            <TextInput source="value" label="Value" type="password" />
          </SimpleFormIterator>
        </ArrayInput>

        <ArrayInput source="dependencies" label="Dependencies">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Package" />
            <TextInput source="version" label="Version" />
          </SimpleFormIterator>
        </ArrayInput>
      </SimpleForm>
    </Edit>
  );
}
