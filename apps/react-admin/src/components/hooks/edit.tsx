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
import { Typography } from "@mui/material";

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
    return undefined;
  };

  return (
    <Edit>
      <SimpleForm>
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
              </>
            );
          }}
        </FormDataConsumer>
        <SelectInput
          source="trigger_id"
          choices={[
            { id: "pre-user-registration", name: "Pre User Registration" },
            { id: "post-user-registration", name: "Post User Registration" },
            { id: "post-user-login", name: "Post User Login" },
            {
              id: "validate-registration-username",
              name: "Validate Registration Username",
            },
            { id: "pre-user-deletion", name: "Pre User Deletion" },
            { id: "post-user-deletion", name: "Post User Deletion" },
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
          parse={(value: string | null) =>
            value === "" || value === null ? undefined : Number(value)
          }
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
