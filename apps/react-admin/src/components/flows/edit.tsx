import {
  Edit,
  SimpleForm,
  TextInput,
  required,
  ArrayInput,
  SimpleFormIterator,
  SelectInput,
  FormDataConsumer,
  DateField,
  Labeled,
  BooleanInput,
} from "react-admin";
import { Typography, Box, Alert } from "@mui/material";

const ACTION_TYPE_CHOICES = [
  { id: "REDIRECT", name: "Redirect" },
  { id: "AUTH0", name: "Auth0" },
  { id: "EMAIL", name: "Email" },
];

const AUTH0_ACTION_CHOICES = [
  { id: "UPDATE_USER", name: "Update User" },
  { id: "CREATE_USER", name: "Create User" },
  { id: "GET_USER", name: "Get User" },
  { id: "SEND_REQUEST", name: "Send Request" },
  { id: "SEND_EMAIL", name: "Send Email" },
];

const EMAIL_ACTION_CHOICES = [{ id: "VERIFY_EMAIL", name: "Verify Email" }];

const REDIRECT_TARGET_CHOICES = [
  {
    id: "change-email",
    name: "Change Email",
  },
  {
    id: "account",
    name: "Account Settings",
  },
  {
    id: "custom",
    name: "Custom URL",
  },
];

// Generate Auth0-style action IDs like "verify_email_address_YrOx"
const generateActionId = (type: string, action?: string) => {
  const suffix = Math.random().toString(36).substring(2, 6);

  if (type === "REDIRECT") {
    return `redirect_user_${suffix}`;
  }
  if (type === "EMAIL" && action === "VERIFY_EMAIL") {
    return `verify_email_address_${suffix}`;
  }
  if (type === "AUTH0") {
    const actionName = (action || "action").toLowerCase().replace(/_/g, "_");
    return `${actionName}_${suffix}`;
  }

  return `action_${suffix}`;
};

export const FlowEdit = () => {
  return (
    <Edit
      transform={(data: Record<string, unknown>) => {
        // Transform actions to include required fields
        if (data.actions && Array.isArray(data.actions)) {
          data.actions = data.actions.map(
            (action: Record<string, unknown>) => {
              const transformed = { ...action };

              // Remove any nested actions array (form bug workaround)
              delete transformed.actions;

              // Add action type for REDIRECT
              if (transformed.type === "REDIRECT") {
                transformed.action = "REDIRECT_USER";
                // Ensure params.target is set with default
                if (
                  !transformed.params ||
                  !(transformed.params as Record<string, unknown>).target
                ) {
                  transformed.params = {
                    target:
                      (transformed.params as Record<string, unknown>)?.target ||
                      (transformed.redirect_target as string) ||
                      "change-email",
                  };
                }
                // Clean up temporary field
                delete transformed.redirect_target;
              }

              // Auto-generate ID if not provided (Auth0-style)
              if (!transformed.id) {
                transformed.id = generateActionId(
                  transformed.type as string,
                  transformed.action as string | undefined,
                );
              }

              return transformed;
            },
          );
        }
        return data;
      }}
    >
      <SimpleForm>
        <TextInput source="name" validate={[required()]} fullWidth />

        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="h6">Actions</Typography>
          <Typography variant="body2" color="text.secondary">
            Define the sequence of actions to execute in this flow.
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Quick Tip:</strong> To redirect users to the change email
          page, add a REDIRECT action with target "Change Email".
        </Alert>

        <ArrayInput source="actions">
          <SimpleFormIterator inline>
            <SelectInput
              source="type"
              label="Type"
              choices={ACTION_TYPE_CHOICES}
              validate={[required()]}
              defaultValue="REDIRECT"
            />

            <FormDataConsumer>
              {({ scopedFormData }) => {
                if (scopedFormData?.type === "AUTH0") {
                  return (
                    <SelectInput
                      source="action"
                      label="Action"
                      choices={AUTH0_ACTION_CHOICES}
                      validate={[required()]}
                    />
                  );
                }

                if (scopedFormData?.type === "EMAIL") {
                  return (
                    <SelectInput
                      source="action"
                      label="Action"
                      choices={EMAIL_ACTION_CHOICES}
                      validate={[required()]}
                    />
                  );
                }

                if (scopedFormData?.type === "REDIRECT") {
                  return (
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      <SelectInput
                        source="redirect_target"
                        label="Redirect To"
                        choices={REDIRECT_TARGET_CHOICES}
                        validate={[required()]}
                        helperText="Select where to redirect the user"
                        defaultValue="change-email"
                      />
                      {scopedFormData?.redirect_target === "custom" && (
                        <TextInput
                          source="redirect_custom_url"
                          label="Custom URL"
                          validate={[required()]}
                          helperText="Enter the full URL to redirect to"
                          fullWidth
                        />
                      )}
                    </Box>
                  );
                }

                return null;
              }}
            </FormDataConsumer>

            <BooleanInput source="allow_failure" label="Allow Failure" />
          </SimpleFormIterator>
        </ArrayInput>

        <Box sx={{ mt: 3 }}>
          <Labeled label="Created At">
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label="Updated At">
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </Box>
      </SimpleForm>
    </Edit>
  );
};
