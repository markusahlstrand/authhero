import { Create, TextInput, required, SimpleForm } from "react-admin";
import { Box, Typography } from "@mui/material";

export const FlowCreate = () => {
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
            Actions can be added after creating the flow.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Flows define sequences of actions to execute, such as verifying
            emails or updating user data.
          </Typography>
        </Box>
      </SimpleForm>
    </Create>
  );
};
