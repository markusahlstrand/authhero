import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "@/components/admin";
import { useWatch } from "react-hook-form";
import { getTemplateChoicesForTrigger, triggerChoices } from "./hookConstants";
import { RecordPickerInput } from "./record-picker-input";

const typeChoices = [
  { id: "url", name: "Webhook" },
  { id: "form", name: "Form" },
  { id: "template", name: "Template" },
  { id: "code", name: "Code" },
];

function TypeSpecificFields() {
  const type = useWatch({ name: "type" });
  const triggerId = useWatch({ name: "trigger_id" });

  if (type === "url") {
    return <TextInput source="url" label="Webhook URL" required />;
  }
  if (type === "form") {
    return (
      <RecordPickerInput
        source="form_id"
        label="Form"
        reference="forms"
        isRequired
      />
    );
  }
  if (type === "template") {
    return (
      <SelectInput
        source="template_id"
        label="Template"
        choices={getTemplateChoicesForTrigger(triggerId)}
      />
    );
  }
  if (type === "code") {
    return (
      <RecordPickerInput
        source="code_id"
        label="Action"
        reference="actions"
        isRequired
      />
    );
  }
  return null;
}

export function HooksCreate() {
  return (
    <Create>
      <SimpleForm>
        <SelectInput source="type" choices={typeChoices} />
        <SelectInput
          source="trigger_id"
          label="Trigger"
          choices={triggerChoices}
        />
        <TypeSpecificFields />
        <BooleanInput source="enabled" defaultValue={true} />
        <BooleanInput source="synchronous" />
        <NumberInput source="priority" defaultValue={0} />
        <BooleanInput source="metadata.inheritable" label="Inheritable" />
        <BooleanInput
          source="metadata.copy_user_metadata"
          label="Copy user metadata"
        />
      </SimpleForm>
    </Create>
  );
}
