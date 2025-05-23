import {
  Create,
  TextInput,
  required,
  SelectInput,
  TabbedForm,
  FormTab,
} from "react-admin";
import { Box, Typography } from "@mui/material";

export const FormCreate = () => {
  return (
    <Create>
      <TabbedForm>
        <FormTab label="Basic Information">
          <TextInput source="name" validate={[required()]} />
          <SelectInput
            source="type"
            validate={[required()]}
            choices={[
              { id: "classic", name: "Classic" },
              { id: "page", name: "Page" },
            ]}
          />
        </FormTab>

        <FormTab label="Flow Diagram">
          <Box sx={{ padding: 2, color: "text.secondary" }}>
            <Typography variant="body1">
              The flow diagram will be available after creating the form.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              You can add nodes and connections to build your form flow in the
              edit view.
            </Typography>
          </Box>
        </FormTab>
      </TabbedForm>
    </Create>
  );
};
