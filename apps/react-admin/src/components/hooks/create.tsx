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

/**
 * Registry of available hook templates.
 * Each template maps to a pre-defined hook function on the server side.
 */
const hookTemplates: Record<
  string,
  { name: string; description: string; trigger_id: string }
> = {
  "ensure-username": {
    name: "Ensure Username",
    description:
      "Automatically assigns a username to users who sign in without one",
    trigger_id: "post-user-login",
  },
  "set-preferred-username": {
    name: "Set Preferred Username",
    description:
      "Sets the preferred_username claim on tokens based on the username from the primary or linked user",
    trigger_id: "credentials-exchange",
  },
};

// Build template choices filtered by trigger_id
function getTemplateChoicesForTrigger(triggerId?: string) {
  return Object.entries(hookTemplates)
    .filter(([, meta]) => !triggerId || meta.trigger_id === triggerId)
    .map(([id, meta]) => ({
      id,
      name: `${meta.name} — ${meta.description}`,
    }));
}

// All trigger IDs that have at least one template
const triggerIdsWithTemplates = new Set(
  Object.values(hookTemplates).map((t) => t.trigger_id),
);

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
            const triggerChoices =
              formData.type === "template"
                ? [
                    {
                      id: "validate-registration-username",
                      name: "Validate Registration Username",
                    },
                    {
                      id: "pre-user-registration",
                      name: "Pre User Registration",
                    },
                    {
                      id: "post-user-registration",
                      name: "Post User Registration",
                    },
                    { id: "post-user-login", name: "Post User Login" },
                    {
                      id: "credentials-exchange",
                      name: "Credentials Exchange",
                    },
                    { id: "pre-user-update", name: "Pre User Update" },
                    { id: "pre-user-deletion", name: "Pre User Deletion" },
                    { id: "post-user-deletion", name: "Post User Deletion" },
                  ].filter((c) => triggerIdsWithTemplates.has(c.id))
                : [
                    {
                      id: "validate-registration-username",
                      name: "Validate Registration Username",
                    },
                    {
                      id: "pre-user-registration",
                      name: "Pre User Registration",
                    },
                    {
                      id: "post-user-registration",
                      name: "Post User Registration",
                    },
                    { id: "post-user-login", name: "Post User Login" },
                    {
                      id: "credentials-exchange",
                      name: "Credentials Exchange",
                    },
                    { id: "pre-user-update", name: "Pre User Update" },
                    { id: "pre-user-deletion", name: "Pre User Deletion" },
                    { id: "post-user-deletion", name: "Post User Deletion" },
                  ];

            return (
              <SelectInput
                source="trigger_id"
                choices={triggerChoices}
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
