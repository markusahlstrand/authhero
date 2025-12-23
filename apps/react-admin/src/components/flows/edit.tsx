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
    const actionName = (action || "action").toLowerCase();
    return `${actionName}_${suffix}`;
  }

  return `action_${suffix}`;
};
git;
// Parse function to extract params into form fields when loading
const parseFlowData = (data: Record<string, unknown>) => {
  if (data.actions && Array.isArray(data.actions)) {
    data.actions = data.actions.map((action: Record<string, unknown>) => {
      const parsed = { ...action };

      // Extract REDIRECT params into form fields
      if (parsed.type === "REDIRECT" && parsed.params) {
        const params = parsed.params as Record<string, unknown>;
        if (params.target) {
          parsed.redirect_target = params.target;
        }
        if (params.custom_url) {
          parsed.redirect_custom_url = params.custom_url;
        }
      }

      return parsed;
    });
  }
  return data;
};

export const FlowEdit = () => {
  return (
    <Edit
      queryOptions={{
        select: (data) => ({
          data: parseFlowData(data.data as Record<string, unknown>),
        }),
      }}
      transform={(data: Record<string, unknown>) => {
        // Transform actions to include required fields
        if (data.actions && Array.isArray(data.actions)) {
          data.actions = data.actions.map((action: Record<string, unknown>) => {
            const transformed = { ...action };

            // Remove any nested actions array (form bug workaround)
            delete transformed.actions;

            // Add action type for REDIRECT
            if (transformed.type === "REDIRECT") {
              transformed.action = "REDIRECT_USER";
              // Build params with target and optional custom_url
              // Prioritize form fields over existing params (user edits should take effect)
              const target =
                (transformed.redirect_target as string) ||
                (transformed.params as Record<string, unknown>)?.target ||
                "change-email";
              const params: Record<string, unknown> = { target };

              // Include custom_url when target is "custom"
              if (target === "custom") {
                const customUrl =
                  (transformed.redirect_custom_url as string) ||
                  (transformed.params as Record<string, unknown>)?.custom_url;
                if (customUrl) {
                  params.custom_url = customUrl;
                }
              }

              transformed.params = params;
              // Clean up temporary fields
              delete transformed.redirect_target;
              delete transformed.redirect_custom_url;
            }

            // Auto-generate ID if not provided (Auth0-style)
            if (!transformed.id) {
              transformed.id = generateActionId(
                transformed.type as string,
                transformed.action as string | undefined,
              );
            }

            return transformed;
          });
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
