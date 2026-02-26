import { useEffect, useRef } from "react";
import {
  BooleanInput,
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  NumberInput,
  regex,
  required,
  SelectInput,
  SimpleForm,
  TextInput,
  useGetList,
  FormDataConsumer,
  useRecordContext,
} from "react-admin";
import { useFormContext, useWatch } from "react-hook-form";
import { Typography } from "@mui/material";
import {
  getTemplateChoicesForTrigger,
  hookTemplates,
  triggerChoices,
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

export function HookEdit() {
  // Fetch forms for the current tenant
  const { data: forms, isLoading: formsLoading } = useGetList("forms", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });
  const record = useRecordContext();

  // Determine type from record or formData
  const getType = (formData: any) => {
    if (formData?.url) return "webhook";
    if (formData?.form_id) return "form";
    if (formData?.template_id) return "template";
    return undefined;
  };

  return (
    <Edit>
      <SimpleForm validate={validateHookForm}>
        <ClearTemplateOnTriggerChange />
        <FormDataConsumer>
          {({ formData }) => {
            const type = getType(formData ?? record);
            return (
              <>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  {type === "webhook"
                    ? "Webhook"
                    : type === "form"
                      ? "Form hook"
                      : type === "template"
                        ? "Template hook"
                        : ""}
                </Typography>
                {type === "webhook" && (
                  <TextInput
                    source="url"
                    validate={[
                      required(),
                      regex(/^https?:\/\/.*/, "Must be a valid HTTP/HTTPS URL"),
                    ]}
                    label="Webhook URL"
                    fullWidth
                    helperText="The webhook endpoint URL that will be called"
                  />
                )}
                {type === "form" && (
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
                )}
                {type === "template" && (
                  <SelectInput
                    source="template_id"
                    label="Template"
                    choices={getTemplateChoicesForTrigger(formData?.trigger_id)}
                    validate={[required()]}
                    fullWidth
                    helperText="The pre-defined hook template to execute"
                  />
                )}
              </>
            );
          }}
        </FormDataConsumer>
        <SelectInput
          source="trigger_id"
          choices={triggerChoices}
          required
        />
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
