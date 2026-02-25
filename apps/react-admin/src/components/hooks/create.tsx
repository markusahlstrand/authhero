import { useEffect, useRef } from "react";
import {
  BooleanInput,
  Create,
  NumberInput,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
  useGetList,
  FormDataConsumer,
} from "react-admin";
import { useFormContext, useWatch } from "react-hook-form";
import {
  getTemplateChoicesForTrigger,
  hookTemplates,
  triggerChoices,
  triggerChoicesWithTemplatesOnly,
} from "./hookConstants";

/**
 * Watches trigger_id and clears template_id whenever the trigger changes
 * to a value that is incompatible with the currently selected template.
 * Renders nothing.
 */
function ClearTemplateOnTriggerChange() {
  const { setValue, getValues } = useFormContext();
  const triggerId = useWatch({ name: "trigger_id" });
  const prevTriggerId = useRef(triggerId);

  useEffect(() => {
    if (
      prevTriggerId.current !== undefined &&
      prevTriggerId.current !== triggerId
    ) {
      const currentTemplateId = getValues("template_id");
      if (currentTemplateId) {
        const meta = hookTemplates[currentTemplateId];
        if (!meta || meta.trigger_id !== triggerId) {
          setValue("template_id", undefined);
        }
      }
    }
    prevTriggerId.current = triggerId;
  }, [triggerId, setValue, getValues]);

  return null;
}

export function HooksCreate() {
  // Fetch forms for the current tenant
  const { data: forms, isLoading: formsLoading } = useGetList("forms", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  // Choices for the type selector
  const typeChoices = [
    { id: "webhook", name: "Webhook" },
    { id: "form", name: "Form" },
    { id: "template", name: "Template" },
  ];

  return (
    <Create>
      <SimpleForm>
        <ClearTemplateOnTriggerChange />
        <SelectInput
          source="type"
          label="Type"
          choices={typeChoices}
          validate={[required()]}
        />
        <FormDataConsumer>
          {({ formData }) => {
            if (formData.type === "webhook") {
              return (
                <TextInput
                  source="url"
                  validate={[required()]}
                  label="Webhook URL"
                  fullWidth
                />
              );
            }
            if (formData.type === "form") {
              return (
                <SelectInput
                  source="form_id"
                  label="Form"
                  choices={
                    formsLoading
                      ? []
                      : (forms || []).map((form) => ({
                        id: form.id,
                        name: form.name,
                      }))
                  }
                  validate={[required()]}
                  fullWidth
                />
              );
            }
            if (formData.type === "template") {
              const templateChoices = getTemplateChoicesForTrigger(
                formData.trigger_id,
              );
              return (
                <SelectInput
                  source="template_id"
                  label="Template"
                  choices={templateChoices}
                  validate={[required()]}
                  fullWidth
                  helperText={
                    formData.trigger_id
                      ? `${templateChoices.length} template(s) available for this trigger`
                      : "Select a trigger first to see available templates"
                  }
                />
              );
            }
            return null;
          }}
        </FormDataConsumer>
        <FormDataConsumer>
          {({ formData }) => {
            // When type is "template", only show triggers that have templates
            const filteredTriggerChoices =
              formData.type === "template"
                ? triggerChoicesWithTemplatesOnly
                : triggerChoices;

            return (
              <SelectInput
                source="trigger_id"
                choices={filteredTriggerChoices}
                required
              />
            );
          }}
        </FormDataConsumer>
        <BooleanInput source="enabled" />
        <BooleanInput
          source="synchronous"
          helperText="The event waits for the webhook to complete and can be canceled"
        />
        <NumberInput
          source="priority"
          helperText="A hook with higher priority will be executed first"
          parse={(value: string | null) => {
            if (value === "" || value === null) return undefined;
            const num = Number(value);
            return Number.isNaN(num) ? undefined : num;
          }}
        />
      </SimpleForm>
    </Create>
  );
}
