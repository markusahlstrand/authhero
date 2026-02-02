import {
  DateField,
  Edit,
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
  useInput,
} from "react-admin";
// @ts-ignore - React Admin components compatibility with React 19
const PaginationComponent = Pagination as any;
// @ts-ignore - React Admin components compatibility with React 19
const DatagridComponent = Datagrid as any;
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
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
} from "@mui/material";
import { useState, useEffect, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { createOrganizationHttpClient } from "../../authProvider";
import {
  getDomainFromStorage,
  getSelectedDomainFromStorage,
  buildUrlWithProtocol,
  formatDomain,
} from "../../utils/domainUtils";

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

const GrantTypesInput = ({ source }: { source: string }) => {
  const { field } = useInput({ source });
  const { value, onChange } = field;

  const grantTypeOptions = [
    { value: "implicit", label: "Implicit" },
    { value: "authorization_code", label: "Authorization Code" },
    { value: "refresh_token", label: "Refresh Token" },
    { value: "client_credentials", label: "Client Credentials" },
    { value: "password", label: "Password" },
    { value: "mfa", label: "MFA" },
    { value: "passwordless_otp", label: "Passwordless OTP" },
  ];

  const handleChange = (grantType: string, checked: boolean) => {
    const currentGrants = Array.isArray(value) ? value : [];
    let newGrants;

    if (checked) {
      newGrants = [...currentGrants, grantType];
    } else {
      newGrants = currentGrants.filter((gt: string) => gt !== grantType);
    }

    onChange(newGrants);
  };

  const isChecked = (grantType: string) => {
    return Array.isArray(value) && value.includes(grantType);
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
        Grant Types
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
        {grantTypeOptions.map((option) => (
          <FormControlLabel
            key={option.value}
            control={
              <Checkbox
                checked={isChecked(option.value)}
                onChange={(e) => handleChange(option.value, e.target.checked)}
              />
            }
            label={option.label}
          />
        ))}
      </Box>
    </Box>
  );
};

const ClientMetadataInput = ({ source }: { source: string }) => {
  const { field } = useInput({ source });
  const { value, onChange } = field;
  const [metadataArray, setMetadataArray] = useState<
    Array<{ key: string; value: string }>
  >([]);

  // Initialize metadata array from the current value
  useEffect(() => {
    if (value && typeof value === "object") {
      // Fields managed by other inputs (BooleanInput, SelectInput, etc.)
      const preservedFields = ["disable_sign_ups", "email_validation"];

      const array = Object.entries(value)
        .filter(([key]) => !preservedFields.includes(key))
        .map(([key, val]) => ({
          key,
          value: String(val),
        }));
      setMetadataArray(array);
    } else if (!value) {
      setMetadataArray([]);
    }
  }, [value]);

  const handleAdd = () => {
    setMetadataArray([...metadataArray, { key: "", value: "" }]);
  };

  const handleRemove = (index: number) => {
    const newArray = metadataArray.filter((_, i) => i !== index);
    setMetadataArray(newArray);
    updateFormData(newArray);
  };

  const handleChange = (
    index: number,
    field: "key" | "value",
    newValue: string,
  ) => {
    const newArray = [...metadataArray];
    const currentItem = newArray[index];
    if (currentItem) {
      newArray[index] = {
        key: field === "key" ? newValue : currentItem.key,
        value: field === "value" ? newValue : currentItem.value,
      };
      setMetadataArray(newArray);
      updateFormData(newArray);
    }
  };

  const updateFormData = (array: Array<{ key: string; value: string }>) => {
    // Fields managed by other inputs (BooleanInput, SelectInput, etc.)
    const preservedFields = ["disable_sign_ups", "email_validation"];

    // Start with preserved fields from current value
    const newObject: Record<string, any> = {};
    if (value && typeof value === "object") {
      preservedFields.forEach((field) => {
        if (field in value) {
          newObject[field] = value[field];
        }
      });
    }

    // Add the metadata array values
    array.forEach((item) => {
      if (item.key && item.key.trim()) {
        newObject[item.key.trim()] = item.value;
      }
    });
    onChange(newObject);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Application Metadata
      </Typography>
      {metadataArray.map((item, index) => (
        <Box key={index} sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <MuiTextField
            label="Key"
            value={item.key}
            onChange={(e) => handleChange(index, "key", e.target.value)}
            sx={{ mr: 1, minWidth: 150 }}
            size="small"
          />
          <MuiTextField
            label="Value"
            value={item.value}
            onChange={(e) => handleChange(index, "value", e.target.value)}
            sx={{ mr: 1, minWidth: 200 }}
            size="small"
          />
          <IconButton
            onClick={() => handleRemove(index)}
            size="small"
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}
      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={handleAdd}
        sx={{ mt: 1 }}
      >
        Add Metadata
      </Button>
    </Box>
  );
};

interface Connection {
  id: string;
  name: string;
  strategy: string;
}

// Helper to get API base URL
const getApiBaseUrl = (): string => {
  const selectedDomain = getSelectedDomainFromStorage();
  const domains = getDomainFromStorage();
  const formattedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find((d) => formatDomain(d.url) === formattedDomain);

  if (domainConfig?.restApiUrl) {
    return domainConfig.restApiUrl.replace(/\/$/, "");
  }
  return buildUrlWithProtocol(selectedDomain).replace(/\/$/, "");
};

// Helper to get tenant ID from URL
const getTenantIdFromUrl = (): string | null => {
  const urlPath = window.location.pathname;
  const matches = urlPath.match(/\/([^/]+)\/clients/);
  return matches && matches[1] ? matches[1] : null;
};

const ConnectionsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabledConnections, setEnabledConnections] = useState<Connection[]>(
    [],
  );
  const [availableConnections, setAvailableConnections] = useState<
    Connection[]
  >([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] =
    useState<Connection | null>(null);

  const record = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const clientId = record?.id as string | undefined;
  const tenantId = getTenantIdFromUrl();

  const loadConnections = useCallback(async () => {
    if (!clientId || !tenantId) return;

    setLoading(true);
    try {
      // Fetch enabled connections from the new API endpoint
      // Use organization-scoped HTTP client to ensure proper org_id in token
      const baseUrl = getApiBaseUrl();
      const orgHttpClient = createOrganizationHttpClient(tenantId);
      const response = await orgHttpClient(
        `${baseUrl}/api/v2/clients/${clientId}/connections`,
        {
          method: "GET",
          headers: {
            "tenant-id": tenantId,
          },
        },
      );

      const result = response.json as {
        enabled_connections: Array<{
          connection_id: string;
          connection?: Connection;
        }>;
      };

      // Get enabled connections with their details
      const enabled: Connection[] = result.enabled_connections
        .filter((ec) => ec.connection)
        .map((ec) => ({
          id: ec.connection_id,
          name: ec.connection!.name,
          strategy: ec.connection!.strategy,
        }));

      // Fetch all connections to determine available ones
      const { data: allConnections } = await dataProvider.getList<Connection>(
        "connections",
        {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );

      // Get available connections (ones not enabled)
      const enabledIds = new Set(enabled.map((c) => c.id));
      const available = allConnections.filter((c) => !enabledIds.has(c.id));

      setEnabledConnections(enabled);
      setAvailableConnections(available);
    } catch (error) {
      console.error("Error loading connections:", error);
      notify("Error loading connections", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [clientId, tenantId, dataProvider, notify]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const updateClientConnections = async (
    newConnectionIds: string[],
  ): Promise<boolean> => {
    if (!clientId || !tenantId) return false;

    setSaving(true);
    try {
      // Use organization-scoped HTTP client to ensure proper org_id in token
      const baseUrl = getApiBaseUrl();
      const orgHttpClient = createOrganizationHttpClient(tenantId);
      await orgHttpClient(
        `${baseUrl}/api/v2/clients/${clientId}/connections`,
        {
          method: "PATCH",
          headers: {
            "tenant-id": tenantId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newConnectionIds),
        },
      );
      return true;
    } catch (error) {
      console.error("Error updating client connections:", error);
      notify("Error updating connections", { type: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddConnection = async () => {
    if (!selectedConnection || !clientId) return;

    const newConnectionIds = [
      ...enabledConnections.map((c) => c.id),
      selectedConnection.id,
    ];
    const success = await updateClientConnections(newConnectionIds);

    if (success) {
      notify("Connection enabled for this client", { type: "success" });
      setAddDialogOpen(false);
      setSelectedConnection(null);

      // Update local state optimistically
      setEnabledConnections([...enabledConnections, selectedConnection]);
      setAvailableConnections(
        availableConnections.filter((c) => c.id !== selectedConnection.id),
      );
    }
  };

  const handleRemoveConnection = async (connection: Connection) => {
    if (!clientId) return;

    const newConnectionIds = enabledConnections
      .filter((c) => c.id !== connection.id)
      .map((c) => c.id);
    const success = await updateClientConnections(newConnectionIds);

    if (success) {
      notify("Connection disabled for this client", { type: "success" });

      // Update local state optimistically
      setEnabledConnections(
        enabledConnections.filter((c) => c.id !== connection.id),
      );
      setAvailableConnections([...availableConnections, connection]);
    }
  };

  const handleMoveConnection = async (
    index: number,
    direction: "up" | "down",
  ) => {
    if (!clientId) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= enabledConnections.length) return;

    // Create new order
    const newOrder = [...enabledConnections];
    const movedConnection = newOrder.splice(index, 1)[0];
    if (!movedConnection) return;
    newOrder.splice(newIndex, 0, movedConnection);

    // Update local state optimistically
    setEnabledConnections(newOrder);

    // Update the client's connections array
    const newConnectionIds = newOrder.map((c) => c.id);
    const success = await updateClientConnections(newConnectionIds);

    if (success) {
      notify("Connection order updated", { type: "success" });
    } else {
      // Revert on failure
      loadConnections();
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", maxWidth: 800 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Enabled Connections
      </Typography>

      {enabledConnections.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          No connections enabled for this client. Click "Add Connection" to
          enable one.
        </Typography>
      ) : (
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <List>
            {enabledConnections.map((connection, index) => (
              <ListItem
                key={connection.id}
                divider={index < enabledConnections.length - 1}
                sx={{
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", mr: 2 }}>
                  <DragIndicatorIcon color="disabled" />
                </Box>
                <ListItemText
                  primary={connection.name}
                  secondary={`Strategy: ${connection.strategy}`}
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Move up">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleMoveConnection(index, "up")}
                        disabled={index === 0 || saving}
                      >
                        <ArrowUpwardIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleMoveConnection(index, "down")}
                        disabled={
                          index === enabledConnections.length - 1 || saving
                        }
                      >
                        <ArrowDownwardIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove connection">
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveConnection(connection)}
                      disabled={saving}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={() => setAddDialogOpen(true)}
        disabled={availableConnections.length === 0}
      >
        Add Connection
      </Button>

      {/* Add Connection Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          setSelectedConnection(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Connection</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Select a connection to enable for this client
          </Typography>
          <Autocomplete
            options={availableConnections}
            getOptionLabel={(option) => `${option.name} (${option.strategy})`}
            value={selectedConnection}
            onChange={(_, value) => setSelectedConnection(value)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <MuiTextField
                {...params}
                label="Connection"
                variant="outlined"
                fullWidth
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Strategy: {option.strategy}
                  </Typography>
                </Box>
              </li>
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddDialogOpen(false);
              setSelectedConnection(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddConnection}
            variant="contained"
            disabled={!selectedConnection || saving}
          >
            {saving ? <CircularProgress size={20} /> : "Add Connection"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export function ClientEdit() {
  // Transform data before submission to ensure client_metadata values are strings
  const transformClientData = (data: Record<string, unknown>) => {
    const transformed = { ...data };

    // Ensure client_metadata values are strings (Auth0 requirement)
    if (
      transformed.client_metadata &&
      typeof transformed.client_metadata === "object"
    ) {
      const metadata = transformed.client_metadata as Record<string, unknown>;
      const stringifiedMetadata: Record<string, string> = {};

      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "boolean") {
          stringifiedMetadata[key] = value ? "true" : "false";
        } else if (value !== null && value !== undefined) {
          stringifiedMetadata[key] = String(value);
        }
      }

      transformed.client_metadata = stringifiedMetadata;
    }

    return transformed;
  };

  return (
    <Edit transform={transformClientData}>
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
          <BooleanInput
            source="auth0_conformant"
            label="Auth0 Conformant Mode"
            helperText="Enable Auth0-compatible behavior. Disable for strict OIDC compliance."
            defaultValue={true}
          />
          <ClientMetadataInput source="client_metadata" />
          <GrantTypesInput source="grant_types" />
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
          <Labeled label="Created At">
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label="Updated At">
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
            pagination={<PaginationComponent />}
            sort={{ field: "audience", order: "ASC" }}
          >
            <DatagridComponent
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
            </DatagridComponent>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Connections">
          <ConnectionsTab />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Advanced">
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            These settings control OAuth/OIDC protocol conformance behavior.
          </Typography>
          <BooleanInput
            source="oidc_conformant"
            label="OIDC Conformant"
            helperText="When enabled, the client will strictly follow the OIDC specification. This affects token claims, scopes, and other protocol behaviors."
          />
          <BooleanInput
            source="is_first_party"
            label="First Party Application"
            helperText="First party applications are trusted applications that don't require user consent for standard scopes."
          />
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
