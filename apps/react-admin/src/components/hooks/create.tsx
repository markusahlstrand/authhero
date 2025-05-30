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
            return null;
          }}
        </FormDataConsumer>
        <SelectInput
          source="trigger_id"
          choices={[
            { id: "pre-user-signup", name: "Pre User Signup" },
            { id: "post-user-registration", name: "Post User Registration" },
            { id: "post-user-login", name: "Post User Login" },
          ]}
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
        />
      </SimpleForm>
    </Create>
  );
}
