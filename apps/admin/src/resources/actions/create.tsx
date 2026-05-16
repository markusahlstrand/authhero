import {
  Create,
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

const defaultCode = `exports.onExecutePostLogin = async (event, api) => {
  // Add your custom logic here
};
`;

interface ActionPayload {
  trigger_id?: string;
  supported_triggers?: Array<{ id: string }>;
  secrets?: Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
}

export function ActionCreate() {
  return (
    <Create
      transform={(data: ActionPayload) => ({
        ...data,
        supported_triggers: data.trigger_id
          ? [{ id: data.trigger_id }]
          : undefined,
        trigger_id: undefined,
        secrets: data.secrets?.filter((s) => s?.name),
      })}
    >
      <SimpleForm>
        <TextInput source="name" required />
        <SelectInput source="trigger_id" label="Trigger" choices={triggerChoices} />
        <TextInput
          source="code"
          multiline
          defaultValue={defaultCode}
          inputClassName="font-mono text-sm"
        />
        <TextInput source="runtime" defaultValue="webworker" />
        <BooleanInput source="is_system" label="System action" />
        <BooleanInput source="inherit" label="Inherit from defaults" />

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
    </Create>
  );
}
