import {
  Create,
  SimpleForm,
  TextInput,
  required,
  useGetOne,
  useNotify,
  useRedirect,
} from "react-admin";
import { Link, useParams } from "react-router-dom";
import { Alert, Box, Button, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export function ScopeCreate() {
  const { id: rsId } = useParams<{ id: string }>();
  const redirect = useRedirect();
  const notify = useNotify();
  const { data: rs } = useGetOne(
    "resource-servers",
    { id: rsId! },
    { enabled: !!rsId },
  );

  if (!rsId) return null;
  // The Scopes tab is the third tab on the resource-server edit form.
  const listPath = `/resource-servers/${rsId}/2`;
  const isSystem = !!rs?.is_system;

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Button
          component={Link}
          to={listPath}
          startIcon={<ArrowBackIcon />}
          size="small"
        >
          Back to scopes
        </Button>
        <Typography variant="h6">
          Add scope{rs?.name ? ` — ${rs.name}` : ""}
        </Typography>
      </Box>

      {isSystem && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Scopes cannot be created on system Resource Servers.
        </Alert>
      )}

      {!isSystem && (
        <Create
          resource="resource-server-scopes"
          transform={(data) => ({ ...data, resource_server_id: rsId })}
          mutationOptions={{
            onSuccess: () => {
              notify("Scope created");
              redirect(listPath);
            },
          }}
          redirect={false}
        >
          <SimpleForm>
            <TextInput
              source="value"
              label="Scope"
              validate={[required()]}
              helperText="e.g., read:users, write:posts"
              fullWidth
            />
            <TextInput
              source="description"
              multiline
              minRows={2}
              helperText="What this scope allows"
              fullWidth
            />
          </SimpleForm>
        </Create>
      )}
    </Box>
  );
}
