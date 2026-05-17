import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { triggerChoices, getTemplateChoicesForTrigger } from "./hookConstants";

function TypeSpecificFields() {
  const record = useRecordContext<{
    url?: string;
    form_id?: string;
    template_id?: string;
    code_id?: string;
    trigger_id?: string;
  }>();
  if (!record) return null;
  if (record.url) return <TextInput source="url" label="Webhook URL" />;
  if (record.form_id) return <TextInput source="form_id" label="Form ID" />;
  if (record.template_id) {
    return (
      <SelectInput
        source="template_id"
        label="Template"
        choices={getTemplateChoicesForTrigger(record.trigger_id)}
      />
    );
  }
  if (record.code_id) return <TextInput source="code_id" label="Code ID" />;
  return null;
}

export function HookEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TypeSpecificFields />
        <SelectInput source="trigger_id" label="Trigger" choices={triggerChoices} />
        <BooleanInput source="enabled" />
        <BooleanInput source="synchronous" />
        <NumberInput source="priority" />
        <BooleanInput source="metadata.inheritable" label="Inheritable" />
        <BooleanInput
          source="metadata.copy_user_metadata"
          label="Copy user metadata"
        />
      </SimpleForm>
    </Edit>
  );
}
