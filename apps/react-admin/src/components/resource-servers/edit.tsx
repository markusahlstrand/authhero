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
import { Stack, Alert, Box, Typography, Button, IconButton, TextField as MuiTextField, InputAdornment, TableContainer, Table, TableHead, TableBody, TableRow, TableCell, TableSortLabel, Paper, TablePagination } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
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

interface Scope {
  value: string;
  description?: string;
}

type SortField = "value" | "description";
type SortOrder = "asc" | "desc";

function ScopesListInput({ disabled }: { disabled?: boolean }) {
  const { setValue, getValues } = useFormContext();
  const scopes: Scope[] = useWatch({ name: "scopes" }) || [];
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filteredAndSortedScopes = useMemo(() => {
    let result = scopes.map((scope, index) => ({ ...scope, originalIndex: index }));
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (scope) =>
          scope.value?.toLowerCase().includes(query) ||
          scope.description?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      const aValue = (a[sortField] || "").toLowerCase();
      const bValue = (b[sortField] || "").toLowerCase();
      const comparison = aValue.localeCompare(bValue);
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return result;
  }, [scopes, searchQuery, sortField, sortOrder]);

  const paginatedScopes = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredAndSortedScopes.slice(start, start + rowsPerPage);
  }, [filteredAndSortedScopes, page, rowsPerPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const handleAdd = useCallback(() => {
    const currentScopes = getValues("scopes") || [];
    setValue("scopes", [...currentScopes, { value: "", description: "" }], { shouldDirty: true });
    // Clear search and go to last page to show the new item
    setSearchQuery("");
    const newTotal = currentScopes.length + 1;
    setPage(Math.floor(newTotal / rowsPerPage));
  }, [getValues, setValue, rowsPerPage]);

  const handleRemove = useCallback((originalIndex: number) => {
    const currentScopes = getValues("scopes") || [];
    const newScopes = currentScopes.filter((_: Scope, i: number) => i !== originalIndex);
    setValue("scopes", newScopes, { shouldDirty: true });
  }, [getValues, setValue]);

  const handleScopeChange = useCallback((originalIndex: number, field: "value" | "description", newValue: string) => {
    const currentScopes = getValues("scopes") || [];
    const newScopes = [...currentScopes];
    newScopes[originalIndex] = { ...newScopes[originalIndex], [field]: newValue };
    setValue("scopes", newScopes, { shouldDirty: true });
  }, [getValues, setValue]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 2 }}>
        <MuiTextField
          placeholder="Search scopes..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          size="small"
          sx={{ width: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {filteredAndSortedScopes.length} of {scopes.length} scope{scopes.length !== 1 ? "s" : ""}
          </Typography>
          {!disabled && (
            <Button
              startIcon={<AddIcon />}
              onClick={handleAdd}
              size="small"
              variant="contained"
            >
              Add Scope
            </Button>
          )}
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: "30%" }}>
                <TableSortLabel
                  active={sortField === "value"}
                  direction={sortField === "value" ? sortOrder : "asc"}
                  onClick={() => handleSort("value")}
                >
                  Scope Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortField === "description"}
                  direction={sortField === "description" ? sortOrder : "asc"}
                  onClick={() => handleSort("description")}
                >
                  Description
                </TableSortLabel>
              </TableCell>
              {!disabled && <TableCell sx={{ width: 50 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedScopes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={disabled ? 2 : 3} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    {searchQuery ? "No scopes match your search" : "No scopes defined"}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedScopes.map((scope) => (
                <TableRow key={scope.originalIndex} hover>
                  <TableCell>
                    <MuiTextField
                      value={scope.value || ""}
                      onChange={(e) => handleScopeChange(scope.originalIndex, "value", e.target.value)}
                      size="small"
                      fullWidth
                      disabled={disabled}
                      variant="standard"
                      placeholder="e.g., read:users"
                      InputProps={{ disableUnderline: disabled }}
                    />
                  </TableCell>
                  <TableCell>
                    <MuiTextField
                      value={scope.description || ""}
                      onChange={(e) => handleScopeChange(scope.originalIndex, "description", e.target.value)}
                      size="small"
                      fullWidth
                      disabled={disabled}
                      variant="standard"
                      placeholder="What this scope allows"
                      InputProps={{ disableUnderline: disabled }}
                    />
                  </TableCell>
                  {!disabled && (
                    <TableCell>
                      <IconButton
                        onClick={() => handleRemove(scope.originalIndex)}
                        color="error"
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filteredAndSortedScopes.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>
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
        <ScopesListInput disabled={isSystem} />
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
