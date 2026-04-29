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
  codeHookTriggerChoices,
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

/**
 * Watches type and clears stale type-specific fields whenever
 * the hook type changes. Renders nothing.
 */
function ClearTypeOnChange() {
  const { setValue } = useFormContext();
  const type = useWatch({ name: "type" });
  const prevType = useRef(type);

  useEffect(() => {
    if (prevType.current !== undefined && prevType.current !== type) {
      if (prevType.current === "code") {
        setValue("code_id", undefined);
      }
      if (prevType.current === "template") {
        setValue("template_id", undefined);
      }
      if (prevType.current === "form") {
        setValue("form_id", undefined);
      }
      if (prevType.current === "webhook") {
        setValue("url", undefined);
      }
      // Trigger choices differ per type, so reset to avoid
      // carrying over an invalid selection
      setValue("trigger_id", undefined);
    }
    prevType.current = type;
  }, [type, setValue]);

  return null;
}

/**
 * Form-level validation: prevents saving an incompatible template_id / trigger_id
 * pair even if the clearing effect hasn't fired yet.
 */
function validateHookForm(values: Record<string, any>) {
  const errors: Record<string, string> = {};
  if (values.template_id && values.trigger_id) {
    const meta = hookTemplates[values.template_id];
    if (meta && meta.trigger_id !== values.trigger_id) {
      errors.template_id =
        "This template is not compatible with the selected trigger";
    }
  }
  return errors;
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
    { id: "code", name: "Code" },
  ];

  return (
    <Create>
      <SimpleForm validate={validateHookForm}>
        <ClearTypeOnChange />
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
            if (formData.type === "code") {
              return (
                <>
                  <TextInput
                    source="code_id"
                    label="Code ID"
                    validate={[required()]}
                    fullWidth
                    helperText="The ID of the hook code record (create one first via the API)"
                  />
                </>
              );
            }
            return null;
          }}
        </FormDataConsumer>
        <FormDataConsumer>
          {({ formData }) => {
            // Narrow trigger choices based on hook type
            const filteredTriggerChoices =
              formData.type === "template"
                ? triggerChoicesWithTemplatesOnly
                : formData.type === "code"
                  ? codeHookTriggerChoices
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
        <BooleanInput
          source="metadata.inheritable"
          label="Publish to sub-tenants"
          helperText="When enabled on a control-plane tenant, surfaces this hook on every sub-tenant via the multi-tenancy runtime fallback. Sub-tenants see it as read-only."
        />
        <FormDataConsumer>
          {({ formData }) =>
            formData?.template_id === "account-linking" ? (
              <BooleanInput
                source="metadata.copy_user_metadata"
                label="Copy user metadata to primary on link"
                helperText="When the secondary user is linked, merge its user_metadata into the primary's. Primary wins on key conflicts; app_metadata is never copied."
              />
            ) : null
          }
        </FormDataConsumer>
      </SimpleForm>
    </Create>
  );
}
