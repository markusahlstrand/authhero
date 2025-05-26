import { Create, TextInput, required, SimpleForm } from "react-admin";
import { Box, Typography } from "@mui/material";

export const FormCreate = () => {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} fullWidth />

        <Box
          sx={{
            mt: 3,
            p: 2,
            bgcolor: "#f5f5f5",
            borderRadius: 1,
            color: "text.secondary",
          }}
        >
          <Typography variant="body1">
            The flow diagram will be available after creating the form.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            You can add nodes and connections to build your form flow in the
            edit view.
          </Typography>
        </Box>
      </SimpleForm>
    </Create>
  );
};
