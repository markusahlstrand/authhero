import {
  DeleteButton,
  Edit,
  SaveButton,
  SimpleForm,
  TextInput,
  Toolbar,
  required,
  useGetOne,
  useNotify,
  useRedirect,
} from "react-admin";
import { Link, useParams } from "react-router-dom";
import { Alert, Box, Button, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

function ScopeEditToolbar({ listPath }: { listPath: string }) {
  return (
    <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
      <SaveButton />
      <DeleteButton
        mutationMode="pessimistic"
        redirect={listPath}
        confirmTitle="Delete scope"
      />
    </Toolbar>
  );
}

export function ScopeEdit() {
  const { id: rsId, scopeId } = useParams<{ id: string; scopeId: string }>();
  const redirect = useRedirect();
  const notify = useNotify();
  const { data: rs } = useGetOne(
    "resource-servers",
    { id: rsId! },
    { enabled: !!rsId },
  );

  if (!rsId || !scopeId) return null;

  const decodedValue = decodeURIComponent(scopeId);
  const recordId = `${rsId}:${decodedValue}`;
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
          {isSystem ? "View scope" : "Edit scope"}
          {rs?.name ? ` — ${rs.name}` : ""}
        </Typography>
      </Box>

      {isSystem && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Scopes are read-only because this Resource Server is a system entity.
        </Alert>
      )}

      <Edit
        resource="resource-server-scopes"
        id={recordId}
        mutationMode="pessimistic"
        mutationOptions={{
          onSuccess: () => {
            notify("Scope updated");
            redirect(listPath);
          },
        }}
        redirect={false}
      >
        <SimpleForm
          toolbar={isSystem ? false : <ScopeEditToolbar listPath={listPath} />}
        >
          <TextInput
            source="value"
            label="Scope"
            validate={[required()]}
            fullWidth
            disabled={isSystem}
          />
          <TextInput
            source="description"
            multiline
            minRows={2}
            helperText="What this scope allows"
            fullWidth
            disabled={isSystem}
          />
        </SimpleForm>
      </Edit>
    </Box>
  );
}
