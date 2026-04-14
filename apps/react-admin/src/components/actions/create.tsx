import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  required,
  ArrayInput,
  SimpleFormIterator,
} from "react-admin";

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

export function ActionCreate() {
  return (
    <Create
      transform={(data: any) => ({
        ...data,
        supported_triggers: data.trigger_id
          ? [{ id: data.trigger_id }]
          : undefined,
        trigger_id: undefined,
      })}
    >
      <SimpleForm>
        <TextInput source="name" validate={[required()]} fullWidth />
        <SelectInput
          source="trigger_id"
          label="Trigger"
          choices={triggerChoices}
          validate={[required()]}
          fullWidth
        />
        <TextInput
          source="code"
          validate={[required()]}
          fullWidth
          multiline
          minRows={10}
          defaultValue={defaultCode}
          sx={{ "& .MuiInputBase-input": { fontFamily: "monospace" } }}
        />
        <TextInput source="runtime" fullWidth defaultValue="node18" />
        <ArrayInput source="secrets">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Name" />
            <TextInput source="value" label="Value" />
          </SimpleFormIterator>
        </ArrayInput>
        <ArrayInput source="dependencies">
          <SimpleFormIterator inline>
            <TextInput source="name" label="Package" />
            <TextInput source="version" label="Version" />
          </SimpleFormIterator>
        </ArrayInput>
      </SimpleForm>
    </Create>
  );
}
