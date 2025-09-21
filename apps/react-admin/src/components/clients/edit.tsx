import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  TextInput,
  BooleanInput,
  SimpleShowLayout,
  TextField,
  TabbedForm,
  SimpleFormIterator,
  ArrayInput,
  FunctionField,
  ReferenceManyField,
  Datagrid,
  Pagination,
  useNotify,
  useDataProvider,
  useRecordContext,
  useRefresh,
} from "react-admin";
import { JsonOutput } from "../common/JsonOutput";
import { DateAgo } from "../common";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField as MuiTextField,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Autocomplete,
  Chip,
} from "@mui/material";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";

const AddClientGrantButton = () => {
  const [open, setOpen] = useState(false);
  const [resourceServers, setResourceServers] = useState<any[]>([]);
  const [selectedResourceServer, setSelectedResourceServer] =
    useState<any>(null);
  const [availableScopes, setAvailableScopes] = useState<any[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingScopes, setLoadingScopes] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  // Get the client ID from the URL path
  const urlPath = window.location.pathname;
  const matches = urlPath.match(/\/([^/]+)\/clients\/([^/]+)/);
  const clientId = matches ? matches[2] : null;

  const handleOpen = async () => {
    setOpen(true);
    await loadResourceServers();
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedResourceServer(null);
    setAvailableScopes([]);
    setSelectedScopes([]);
  };

  const loadResourceServers = async () => {
    setLoading(true);
    try {
      const { data } = await dataProvider.getList("resource-servers", {
        pagination: { page: 1, perPage: 100 },
        sort: { field: "name", order: "ASC" },
        filter: {},
      });
      setResourceServers(data);
    } catch (error) {
      console.error("Error loading resource servers:", error);
      notify("Error loading resource servers", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadScopes = async (resourceServer: any) => {
    setLoadingScopes(true);
    try {
      // Build available scopes from the selected resource server's scopes property
      const allScopes = (resourceServer?.scopes || []).map((s: any) => ({
        value: s?.value ?? s?.permission_name ?? s,
        description: s?.description ?? "",
      }));

      // Fetch the client's existing grants from /client-grants
      const existingRes = await dataProvider.getList("client-grants", {
        pagination: { page: 1, perPage: 200 },
        sort: { field: "audience", order: "ASC" },
        filter: { client_id: clientId },
      });

      const existingAll = existingRes.data ?? [];
      // Find existing grant for this resource server
      const existingGrant = existingAll.find(
        (g: any) => g.audience === resourceServer?.identifier,
      );

      const existingScopes = existingGrant?.scope || [];
      const existingSet = new Set(existingScopes);

      // Filter out scopes the client already has
      const filtered = allScopes.filter(
        (s: any) => s.value && !existingSet.has(s.value),
      );

      setAvailableScopes(filtered);
    } catch (error) {
      console.error("Error loading scopes:", error);
      notify("Error loading scopes", { type: "error" });
    } finally {
      setLoadingScopes(false);
    }
  };

  const handleResourceServerChange = (resourceServer: any) => {
    setSelectedResourceServer(resourceServer);
    setSelectedScopes([]);
    if (resourceServer) {
      loadScopes(resourceServer);
    } else {
      setAvailableScopes([]);
    }
  };

  const handleAddClientGrant = async () => {
    if (!clientId || !selectedResourceServer || selectedScopes.length === 0) {
      notify("Please select a resource server and at least one scope", {
        type: "warning",
      });
      return;
    }

    try {
      // Check if there's already a grant for this resource server
      const existingRes = await dataProvider.getList("client-grants", {
        pagination: { page: 1, perPage: 200 },
        sort: { field: "audience", order: "ASC" },
        filter: { client_id: clientId },
      });

      const existingGrant = existingRes.data?.find(
        (g: any) => g.audience === selectedResourceServer.identifier,
      );

      const newScopes = selectedScopes.map((scope: any) => scope.value);

      if (existingGrant) {
        // Update existing grant by merging scopes
        const existingScopes = existingGrant.scope || [];
        const mergedScopes = [...new Set([...existingScopes, ...newScopes])];

        await dataProvider.update("client-grants", {
          id: existingGrant.id,
          data: {
            scope: mergedScopes,
          },
          previousData: existingGrant,
        });

        notify(
          `Client grant updated with ${newScopes.length} additional scope(s)`,
          {
            type: "success",
          },
        );
      } else {
        // Create new grant
        const payload = {
          client_id: clientId,
          audience: selectedResourceServer.identifier,
          scope: newScopes,
        };

        await dataProvider.create("client-grants", {
          data: payload,
        });

        notify(`Client grant created with ${newScopes.length} scope(s)`, {
          type: "success",
        });
      }

      handleClose();
      refresh();
    } catch (error) {
      console.error("Error creating/updating client grant:", error);
      notify("Error creating/updating client grant", { type: "error" });
    }
  };

  if (!clientId) {
    return null;
  }

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={handleOpen}
        sx={{ mb: 2 }}
      >
        Add Client Grant
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Add Client Grant</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Select a resource server and scopes to grant access to this client
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Autocomplete
              options={resourceServers}
              getOptionLabel={(option) => option.name || option.identifier}
              value={selectedResourceServer}
              onChange={(_, value) => handleResourceServerChange(value)}
              loading={loading}
              isOptionEqualToValue={(option, value) =>
                !!option &&
                !!value &&
                (option.id === value.id ||
                  option.identifier === value.identifier)
              }
              renderInput={(params) => (
                <MuiTextField
                  {...params}
                  label="Resource Server"
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading ? (
                          <CircularProgress color="inherit" size={20} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Box>

          {selectedResourceServer && (
            <>
              <Box sx={{ mb: 3 }}>
                <Autocomplete
                  multiple
                  options={availableScopes}
                  getOptionLabel={(option) =>
                    `${option.value} - ${option.description || "No description"}`
                  }
                  value={selectedScopes}
                  onChange={(_, value) => setSelectedScopes(value)}
                  loading={loadingScopes}
                  isOptionEqualToValue={(option, value) =>
                    option?.value === value?.value
                  }
                  renderInput={(params) => (
                    <MuiTextField
                      {...params}
                      label="Scopes"
                      variant="outlined"
                      fullWidth
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingScopes ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.value}>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {option.value}
                        </Typography>
                        {option.description && (
                          <Typography variant="caption" color="text.secondary">
                            {option.description}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  )}
                />
              </Box>

              {!loadingScopes && availableScopes.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  This client already has access to all available scopes for the
                  selected resource server.
                </Typography>
              )}

              {selectedScopes.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Selected Scopes ({selectedScopes.length}):
                  </Typography>
                  <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                    {selectedScopes.map((scope, index) => (
                      <Typography key={index} variant="body2" sx={{ ml: 2 }}>
                        • {scope.value}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAddClientGrant}
            variant="contained"
            disabled={selectedScopes.length === 0 || !selectedResourceServer}
          >
            Add Grant with {selectedScopes.length} Scope(s)
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const EditClientGrantButton = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableScopes, setAvailableScopes] = useState<any[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<any[]>([]);

  const clientGrant = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!clientGrant) {
    return null;
  }

  const handleOpen = async () => {
    setOpen(true);
    await loadResourceServerAndScopes();
  };

  const handleClose = () => {
    setOpen(false);
    setAvailableScopes([]);
    setSelectedScopes([]);
  };

  const loadResourceServerAndScopes = async () => {
    setLoading(true);
    try {
      // Find the resource server by audience
      const { data: resourceServers } = await dataProvider.getList(
        "resource-servers",
        {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );

      const rs = resourceServers.find(
        (rs: any) => rs.identifier === clientGrant.audience,
      );
      if (!rs) {
        notify("Resource server not found", { type: "error" });
        handleClose();
        return;
      }

      // Get all scopes from the resource server
      const allScopes = (rs.scopes || []).map((s: any) => ({
        value: s?.value ?? s?.permission_name ?? s,
        description: s?.description ?? "",
      }));

      // Get currently assigned scopes
      const currentScopeValues = clientGrant.scope || [];

      // Filter out already assigned scopes from available scopes
      const unassignedScopes = allScopes.filter(
        (scope: any) => !currentScopeValues.includes(scope.value),
      );

      setAvailableScopes(unassignedScopes);

      // Set currently selected scopes (start with empty since we're only showing unassigned)
      setSelectedScopes([]);
    } catch (error) {
      console.error("Error loading resource server and scopes:", error);
      notify("Error loading scopes", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (selectedScopes.length === 0) {
      notify("Please select at least one scope to add", { type: "warning" });
      return;
    }

    try {
      // Get the newly selected scope values
      const newScopeValues = selectedScopes.map((scope: any) => scope.value);

      // Get existing scopes and merge with new ones
      const existingScopes = clientGrant.scope || [];
      const mergedScopes = [...existingScopes, ...newScopeValues];

      await dataProvider.update("client-grants", {
        id: clientGrant.id,
        data: {
          scope: mergedScopes,
        },
        previousData: clientGrant,
      });

      notify(`Added ${newScopeValues.length} scope(s) to client grant`, {
        type: "success",
      });
      handleClose();
      refresh();
    } catch (error) {
      console.error("Error updating client grant:", error);
      notify("Error updating client grant", { type: "error" });
    }
  };

  return (
    <>
      <Tooltip title="Add scopes to client grant">
        <IconButton onClick={handleOpen} size="small">
          <EditIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Add Scopes to Client Grant</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Add additional scopes to <strong>{clientGrant.audience}</strong>
          </Typography>

          {/* Show currently assigned scopes */}
          {clientGrant.scope && clientGrant.scope.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Currently assigned scopes:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {clientGrant.scope.map((scope: string) => (
                  <Chip
                    key={scope}
                    label={scope}
                    size="small"
                    variant="filled"
                    color="primary"
                  />
                ))}
              </Box>
            </Box>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Autocomplete
              multiple
              options={availableScopes}
              getOptionLabel={(option) => option.value}
              value={selectedScopes}
              onChange={(_, value) => setSelectedScopes(value)}
              isOptionEqualToValue={(option, value) =>
                option.value === value.value
              }
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option.value}
                    {...getTagProps({ index })}
                    key={option.value}
                  />
                ))
              }
              renderInput={(params) => (
                <MuiTextField
                  {...params}
                  label="Additional Scopes"
                  placeholder="Select additional scopes to add"
                  variant="outlined"
                  fullWidth
                />
              )}
              renderOption={(props, option) => (
                <li {...props}>
                  <Box>
                    <Typography variant="body2" component="div">
                      {option.value}
                    </Typography>
                    {option.description && (
                      <Typography variant="caption" color="text.secondary">
                        {option.description}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={loading || selectedScopes.length === 0}
          >
            Add Scopes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const RemoveClientGrantButton = () => {
  const [open, setOpen] = useState(false);
  const clientGrant = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!clientGrant) {
    return null;
  }

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleRemove = async () => {
    try {
      await dataProvider.delete("client-grants", {
        id: clientGrant.id,
        previousData: clientGrant,
      });
      notify("Client grant removed successfully", { type: "success" });
      handleClose();
      refresh();
    } catch (error) {
      console.error("Error removing client grant:", error);
      notify("Error removing client grant", { type: "error" });
    }
  };

  return (
    <>
      <Tooltip title="Remove client grant">
        <IconButton onClick={handleOpen} size="small">
          <DeleteIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Confirm Removal</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove this client grant for{" "}
            <strong>{clientGrant.audience}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleRemove} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export function ClientEdit() {
  return (
    <Edit>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="id" />
      </SimpleShowLayout>
      <TabbedForm>
        <TabbedForm.Tab label="details">
          <TextInput source="id" />
          <TextInput source="name" />
          <TextInput source="client_secret" />
          <SelectInput
            source="client_metadata.email_validation"
            choices={[
              { id: "disabled", name: "Disabled" },
              { id: "enabled", name: "Enabled" },
              { id: "enforced", name: "Enforced" },
            ]}
          />
          <BooleanInput
            source="client_metadata.disable_sign_ups"
            format={(value) => value === "true" || value === true}
            parse={(value) => (value ? "true" : "false")}
          />
          <ArrayInput source="callbacks">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="allowed_logout_urls">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="web_origins">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="allowed_clients">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="SSO">
          <TextInput source="addons.samlp.audience" label="audience" />
          <TextInput source="addons.samlp.destination" label="destination" />
          <TextInput
            multiline
            source="addons.samlp.mappings"
            format={(value) => (value ? JSON.stringify(value, null, 2) : "")}
            parse={(value) => {
              try {
                return value ? JSON.parse(value) : {};
              } catch {
                throw new Error("Invalid JSON");
              }
            }}
          />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Client Grants">
          <AddClientGrantButton />
          <ReferenceManyField
            reference="client-grants"
            target="client_id"
            pagination={<Pagination />}
            sort={{ field: "audience", order: "ASC" }}
          >
            <Datagrid
              sx={{
                width: "100%",
                "& .column-comment": {
                  maxWidth: "20em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              }}
              rowClick=""
              bulkActionButtons={false}
            >
              <TextField source="audience" label="Resource Server" />
              <FunctionField
                source="scope"
                label="Scopes"
                render={(record: any) => {
                  if (!record.scope || record.scope.length === 0) {
                    return "No scopes";
                  }
                  return record.scope.join(", ");
                }}
              />
              <FunctionField
                source="created_at"
                render={(record: any) =>
                  record.created_at ? <DateAgo date={record.created_at} /> : "-"
                }
                label="Created"
              />
              <EditClientGrantButton />
              <RemoveClientGrantButton />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Raw JSON">
          <FunctionField
            source="date"
            render={(record: any) => <JsonOutput data={record} />}
          />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
