import {
  Edit,
  TextInput,
  required,
  TabbedForm,
  ReferenceManyField,
  Datagrid,
  Pagination,
  TextField,
  FunctionField,
  useDataProvider,
  useNotify,
  useRefresh,
  useRecordContext,
} from "react-admin";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
  Autocomplete,
  CircularProgress,
  IconButton,
  TextField as MuiTextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { DateAgo } from "../common";
import { useParams } from "react-router-dom";

const AddRolePermissionButton = () => {
  const [open, setOpen] = useState(false);
  const [resourceServers, setResourceServers] = useState<any[]>([]);
  const [selectedResourceServer, setSelectedResourceServer] =
    useState<any>(null);
  const [availablePermissions, setAvailablePermissions] = useState<any[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  // Get role id from the route params (/:tenantId/roles/:id)
  const { id: roleId } = useParams();

  const handleOpen = async () => {
    setOpen(true);
    await loadResourceServers();
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedResourceServer(null);
    setAvailablePermissions([]);
    setSelectedPermissions([]);
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

  const loadPermissions = async (resourceServer: any) => {
    setLoadingPermissions(true);
    try {
      // Build available scopes from the selected resource server's property
      const allScopes = (resourceServer?.scopes || []).map((s: any) => ({
        permission_name: s?.permission_name ?? s?.value ?? s,
        description: s?.description ?? "",
      }));

      // Fetch the role's existing permissions from /roles/:id/permissions
      const existingRes = await dataProvider.getList(
        `roles/${roleId}/permissions`,
        {
          pagination: { page: 1, perPage: 200 },
          sort: { field: "permission_name", order: "ASC" },
          filter: {},
        },
      );

      const existingAll = existingRes.data ?? [];
      // Narrow to the selected resource server
      const existingForServer = existingAll.filter((p: any) => {
        const identifier =
          p.resource_server_identifier ?? p.resource_server_id ?? p.audience;
        return identifier === resourceServer?.identifier;
      });

      const existingSet = new Set(
        existingForServer.map((p: any) => p.permission_name),
      );

      // Filter out scopes the role already has
      const filtered = allScopes.filter(
        (p: any) => p.permission_name && !existingSet.has(p.permission_name),
      );

      setAvailablePermissions(filtered);
    } catch (error) {
      console.error("Error loading permissions:", error);
      notify("Error loading permissions", { type: "error" });
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleResourceServerChange = (resourceServer: any) => {
    setSelectedResourceServer(resourceServer);
    setSelectedPermissions([]);
    if (resourceServer) {
      loadPermissions(resourceServer);
    } else {
      setAvailablePermissions([]);
    }
  };

  const handleAddPermissions = async () => {
    if (!roleId || selectedPermissions.length === 0) {
      notify("Please select at least one permission", { type: "warning" });
      return;
    }

    try {
      const payload = {
        permissions: selectedPermissions.map((permission: any) => ({
          permission_name: permission.permission_name,
          resource_server_identifier: selectedResourceServer.identifier,
        })),
      };

      await dataProvider.create(`roles/${roleId}/permissions`, {
        data: payload,
      });

      notify(`${selectedPermissions.length} permission(s) added successfully`, {
        type: "success",
      });
      handleClose();
      refresh();
    } catch (error) {
      console.error("Error adding permissions:", error);
      notify("Error adding permissions", { type: "error" });
    }
  };

  if (!roleId) return null;

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={handleOpen}
        sx={{ mb: 2 }}
      >
        Add Permission
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Add Permissions</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Select a resource server and permissions to assign to this role
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
                  option.identifier === value.identifier ||
                  option.audience === value.audience)
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
                  options={availablePermissions}
                  getOptionLabel={(option) =>
                    `${option.permission_name} - ${option.description || "No description"}`
                  }
                  value={selectedPermissions}
                  onChange={(_, value) => setSelectedPermissions(value)}
                  loading={loadingPermissions}
                  isOptionEqualToValue={(option, value) =>
                    option?.permission_name === value?.permission_name
                  }
                  renderInput={(params) => (
                    <MuiTextField
                      {...params}
                      label="Permissions"
                      variant="outlined"
                      fullWidth
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingPermissions ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.permission_name}>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {option.permission_name}
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
                {!loadingPermissions && availablePermissions.length > 0 && (
                  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedPermissions([...availablePermissions])}
                      disabled={selectedPermissions.length === availablePermissions.length}
                    >
                      Select All ({availablePermissions.length})
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedPermissions([])}
                      disabled={selectedPermissions.length === 0}
                    >
                      Clear Selection
                    </Button>
                  </Box>
                )}
              </Box>

              {!loadingPermissions && availablePermissions.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  This role already has all available scopes for the selected
                  resource server.
                </Typography>
              )}

              {selectedPermissions.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Selected Permissions ({selectedPermissions.length}):
                  </Typography>
                  <Box sx={{ maxHeight: 200, overflow: "auto" }}>
                    {selectedPermissions.map((permission, index) => (
                      <Typography key={index} variant="body2" sx={{ ml: 2 }}>
                        • {permission.permission_name}
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
            onClick={handleAddPermissions}
            variant="contained"
            disabled={selectedPermissions.length === 0}
          >
            Add {selectedPermissions.length} Permission(s)
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const RemoveRolePermissionButton = () => {
  const [open, setOpen] = useState(false);
  const permission = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const { id: roleId } = useParams();

  if (!permission || !roleId) return null;

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleRemove = async () => {
    try {
      const permissionId = encodeURIComponent(
        `${permission.resource_server_identifier}:${permission.permission_name}`,
      );

      await dataProvider.delete(`roles/${roleId}/permissions`, {
        id: permissionId,
        previousData: permission,
      });
      notify("Permission removed successfully", { type: "success" });
      handleClose();
      refresh();
    } catch (error) {
      console.error("Error removing permission:", error);
      notify("Error removing permission", { type: "error" });
    }
  };

  return (
    <>
      <IconButton onClick={handleOpen} color="error" size="small">
        <DeleteIcon />
      </IconButton>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Remove Permission</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove the permission "
            {permission.permission_name}" from resource server "
            {permission.resource_server_name ||
              permission.resource_server_identifier}
            "? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleRemove} color="error" autoFocus>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export function RoleEdit() {
  return (
    <Edit>
      <TabbedForm>
        <TabbedForm.Tab label="details">
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
              width: "100%",
            }}
          >
            <TextInput source="id" disabled fullWidth />
            <TextInput source="name" validate={[required()]} fullWidth />
            <Box sx={{ gridColumn: "1 / -1" }}>
              <TextInput source="description" multiline minRows={6} fullWidth />
            </Box>
          </Box>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="permissions">
          <AddRolePermissionButton />
          <ReferenceManyField
            reference="permissions"
            target="role_id"
            pagination={<Pagination />}
            sort={{ field: "permission_name", order: "ASC" }}
          >
            <Datagrid rowClick="" bulkActionButtons={false}>
              <TextField
                source="resource_server_identifier"
                label="Resource Server"
              />
              <TextField source="resource_server_name" label="Resource Name" />
              <TextField source="permission_name" label="Permission" />
              <TextField source="description" label="Description" />
              <FunctionField
                source="created_at"
                render={(record: any) =>
                  record.created_at ? <DateAgo date={record.created_at} /> : "-"
                }
                label="Assigned"
              />
              <RemoveRolePermissionButton />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
