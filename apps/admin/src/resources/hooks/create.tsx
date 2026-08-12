import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "@/components/admin";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  getTemplateChoicesForTrigger,
  getTriggerChoicesForType,
  pageChoices,
} from "./hookConstants";

const typeChoices = [
  { id: "url", name: "Webhook" },
  { id: "form", name: "Form" },
  { id: "template", name: "Template" },
  { id: "code", name: "Code" },
  { id: "page", name: "Page" },
];

function TypeSpecificFields() {
  const type = useWatch({ name: "type" });
  const triggerId = useWatch({ name: "trigger_id" });

  if (type === "url") {
    return <TextInput source="url" label="Webhook URL" required />;
  }
  if (type === "form") {
    return <TextInput source="form_id" label="Form ID" required />;
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
    return <TextInput source="code_id" label="Code (action) ID" required />;
  }
  if (type === "page") {
    return (
      <>
        <SelectInput source="page_id" label="Page" choices={pageChoices} />
        <TextInput
          source="permission_required"
          label="Permission required"
          helperText="Only interrupt the login for users holding this permission (e.g. users:impersonate). Leave empty to show the page on every login."
        />
      </>
    );
  }
  return null;
}

/**
 * Form, page and code hooks each run on a subset of the triggers, so offering
 * the rest would just produce a 400 from the management API — or, before the
 * form-hook trigger list was narrowed, a hook that stored fine and never ran.
 */
function TriggerField() {
  const type = useWatch({ name: "type" });
  const triggerId = useWatch({ name: "trigger_id" });
  const { setValue } = useFormContext();
  const choices = getTriggerChoicesForType(type);

  // Narrowing the choices does not narrow what the form already holds: a
  // trigger picked under the previous type stays in form state, invisible in
  // a select that no longer offers it, and submits as a 400 from the
  // management API. Drop it as soon as it stops being a valid choice.
  useEffect(() => {
    if (triggerId && !choices.some((choice) => choice.id === triggerId)) {
      setValue("trigger_id", "");
    }
  }, [triggerId, choices, setValue]);

  return <SelectInput source="trigger_id" label="Trigger" choices={choices} />;
}

export function HooksCreate() {
  return (
    <Create>
      <SimpleForm>
        <SelectInput source="type" choices={typeChoices} />
        <TriggerField />
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
