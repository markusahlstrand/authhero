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
  FieldTitle,
  BooleanInput,
} from "react-admin";
import { Typography, Box } from "@mui/material";

const ACTION_TYPE_CHOICES = [
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

export const FlowEdit = () => {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} fullWidth />

        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="h6">Actions</Typography>
          <Typography variant="body2" color="text.secondary">
            Define the sequence of actions to execute in this flow.
          </Typography>
        </Box>

        <ArrayInput source="actions">
          <SimpleFormIterator inline>
            <TextInput
              source="id"
              label="Action ID"
              validate={[required()]}
              helperText="Unique identifier for this action step"
            />
            <TextInput source="alias" label="Alias (optional)" />

            <SelectInput
              source="type"
              label="Type"
              choices={ACTION_TYPE_CHOICES}
              validate={[required()]}
            />

            <FormDataConsumer>
              {({ scopedFormData, getSource }) => {
                if (!getSource) return null;

                if (scopedFormData?.type === "AUTH0") {
                  return (
                    <SelectInput
                      source={getSource("action")}
                      label="Action"
                      choices={AUTH0_ACTION_CHOICES}
                      validate={[required()]}
                    />
                  );
                }

                if (scopedFormData?.type === "EMAIL") {
                  return (
                    <SelectInput
                      source={getSource("action")}
                      label="Action"
                      choices={EMAIL_ACTION_CHOICES}
                      validate={[required()]}
                    />
                  );
                }

                return null;
              }}
            </FormDataConsumer>

            <BooleanInput source="allow_failure" label="Allow Failure" />
            <BooleanInput source="mask_output" label="Mask Output" />
          </SimpleFormIterator>
        </ArrayInput>

        <Box sx={{ mt: 3 }}>
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </Box>
      </SimpleForm>
    </Edit>
  );
};
