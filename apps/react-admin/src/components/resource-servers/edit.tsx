import {
  Edit,
  TextInput,
  BooleanInput,
  TextField,
  TabbedForm,
  required,
  NumberInput,
  FormDataConsumer,
  useRecordContext,
} from "react-admin";
import { Stack, Alert, Pagination, Box, Typography, Button, IconButton, TextField as MuiTextField } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useState, useMemo, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";

function SystemEntityAlert() {
  const record = useRecordContext();
  if (!record?.is_system) return null;

  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      This Resource Server represents a system entity and cannot be modified or
      deleted. You can still authorize applications to consume this resource
      server.
    </Alert>
  );
}

const SCOPES_PER_PAGE = 10;

interface Scope {
  value: string;
  description?: string;
}

function PaginatedScopesInput({ disabled }: { disabled?: boolean }) {
  const { setValue, getValues } = useFormContext();
  const scopes: Scope[] = useWatch({ name: "scopes" }) || [];
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(scopes.length / SCOPES_PER_PAGE));
  
  const paginatedScopes = useMemo(() => {
    const start = (page - 1) * SCOPES_PER_PAGE;
    const end = start + SCOPES_PER_PAGE;
    return scopes.slice(start, end).map((scope, index) => ({
      ...scope,
      actualIndex: start + index,
    }));
  }, [scopes, page]);

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleAdd = useCallback(() => {
    const currentScopes = getValues("scopes") || [];
    setValue("scopes", [...currentScopes, { value: "", description: "" }], { shouldDirty: true });
    // Navigate to the last page where the new item will be
    const newTotalPages = Math.ceil((currentScopes.length + 1) / SCOPES_PER_PAGE);
    setPage(newTotalPages);
  }, [getValues, setValue]);

  const handleRemove = useCallback((actualIndex: number) => {
    const currentScopes = getValues("scopes") || [];
    const newScopes = currentScopes.filter((_: Scope, i: number) => i !== actualIndex);
    setValue("scopes", newScopes, { shouldDirty: true });
    // Adjust page if we removed the last item on current page
    const newTotalPages = Math.ceil(newScopes.length / SCOPES_PER_PAGE);
    if (page > newTotalPages && newTotalPages > 0) {
      setPage(newTotalPages);
    }
  }, [getValues, setValue, page]);

  const handleScopeChange = useCallback((actualIndex: number, field: "value" | "description", newValue: string) => {
    const currentScopes = getValues("scopes") || [];
    const newScopes = [...currentScopes];
    newScopes[actualIndex] = { ...newScopes[actualIndex], [field]: newValue };
    setValue("scopes", newScopes, { shouldDirty: true });
  }, [getValues, setValue]);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {scopes.length} scope{scopes.length !== 1 ? "s" : ""} total
        </Typography>
        {!disabled && (
          <Button
            startIcon={<AddIcon />}
            onClick={handleAdd}
            size="small"
            variant="outlined"
          >
            Add Scope
          </Button>
        )}
      </Box>

      {paginatedScopes.map((scope) => (
        <Stack
          key={scope.actualIndex}
          spacing={2}
          direction="row"
          sx={{ width: "100%", alignItems: "flex-start", mb: 2 }}
        >
          <MuiTextField
            value={scope.value || ""}
            onChange={(e) => handleScopeChange(scope.actualIndex, "value", e.target.value)}
            label="Scope Name"
            helperText="e.g., read:users, write:posts"
            sx={{ flex: 1 }}
            disabled={disabled}
            size="small"
            required
          />
          <MuiTextField
            value={scope.description || ""}
            onChange={(e) => handleScopeChange(scope.actualIndex, "description", e.target.value)}
            label="Description"
            helperText="What this scope allows"
            sx={{ flex: 2 }}
            disabled={disabled}
            size="small"
          />
          {!disabled && (
            <IconButton
              onClick={() => handleRemove(scope.actualIndex)}
              color="error"
              sx={{ mt: 1 }}
            >
              <DeleteIcon />
            </IconButton>
          )}
        </Stack>
      ))}

      {totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </Box>
  );
}

function ResourceServerForm() {
  const record = useRecordContext();
  const isSystem = record?.is_system;

  return (
    <TabbedForm>
      <TabbedForm.Tab label="Details">
        <SystemEntityAlert />
        <Stack spacing={2}>
          <TextInput source="name" validate={[required()]} disabled={isSystem} />
          <TextInput
            source="identifier"
            validate={[required()]}
            helperText="Unique identifier for this resource server"
            disabled={isSystem}
          />
        </Stack>

        <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
          <BooleanInput
            source="signing_alg_values_supported"
            defaultValue={true}
            disabled={isSystem}
          />
          <BooleanInput
            source="skip_consent_for_verifiable_first_party_clients"
            defaultValue={true}
            disabled={isSystem}
          />
          <BooleanInput source="allow_offline_access" defaultValue={true} disabled={isSystem} />
        </Stack>

        <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
          <TextInput
            source="signing_alg"
            defaultValue="RS256"
            helperText="Signing algorithm for tokens"
            disabled={isSystem}
          />
        </Stack>

        <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
          <NumberInput
            source="token_lifetime"
            defaultValue={1209600}
            helperText="Token lifetime in seconds (default: 14 days)"
            disabled={isSystem}
          />
          <NumberInput
            source="token_lifetime_for_web"
            defaultValue={7200}
            helperText="Web token lifetime in seconds (default: 2 hours)"
            disabled={isSystem}
          />
        </Stack>

        <Stack spacing={2} direction="row" sx={{ mt: 4 }}>
          <TextField source="created_at" />
          <TextField source="updated_at" />
        </Stack>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="RBAC">
        <Stack spacing={3}>
          <BooleanInput
            source="options.enforce_policies"
            label="Enable RBAC"
            helperText="Enable Role-Based Access Control for this resource server"
            disabled={isSystem}
          />

          <FormDataConsumer>
            {({ formData }) => (
              <BooleanInput
                source="options.token_dialect"
                label="Add permissions in token"
                helperText="Include permissions directly in the access token"
                disabled={isSystem || !formData?.options?.enforce_policies}
                format={(value) => value === "access_token_authz"}
                parse={(checked) =>
                  checked ? "access_token_authz" : "access_token"
                }
              />
            )}
          </FormDataConsumer>
        </Stack>
      </TabbedForm.Tab>

      <TabbedForm.Tab label="Scopes">
        <PaginatedScopesInput disabled={isSystem} />
      </TabbedForm.Tab>
    </TabbedForm>
  );
}

export function ResourceServerEdit() {
  return (
    <Edit>
      <ResourceServerForm />
    </Edit>
  );
}
