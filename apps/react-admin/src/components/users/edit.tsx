import {
  Datagrid,
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  Pagination,
  ReferenceManyField,
  TabbedForm,
  TextField,
  TextInput,
  FunctionField,
  BooleanField,
  ArrayField,
  SimpleShowLayout,
  useNotify,
  useDataProvider,
  useRecordContext,
  useRefresh,
} from "react-admin";
import { LogType, LogIcon } from "../logs";
import { DateAgo } from "../common";
import {
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  TextField as MuiTextField,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  DialogContentText,
  Autocomplete,
} from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";
import { useState } from "react";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useParams } from "react-router-dom";
import { useEffect } from "react";

const LinkUserButton = () => {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const record = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    setSearchText("");
    setSearchResults([]);
  };

  const handleSearch = async () => {
    if (!searchText.trim()) return;

    setSearching(true);
    try {
      // Search for users by email
      const { data } = await dataProvider.getList("users", {
        pagination: { page: 1, perPage: 10 },
        sort: { field: "email", order: "ASC" },
        filter: { q: searchText },
      });

      // Filter out the current user from results
      const filteredData = data.filter((user) => user.id !== record?.id);
      setSearchResults(filteredData);
    } catch (error) {
      console.error("Error searching for users:", error);
      notify("Error searching for users", { type: "error" });
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Removed the condition that might hide the button
  // if (!record) {
  //   return null;
  // }

  const handleLinkUser = async (userId) => {
    if (!record) {
      notify("Error: No user selected", { type: "error" });
      return;
    }

    try {
      // Changed API endpoint to link the current user TO the selected user instead
      await dataProvider.create(`users/${userId}/identities`, {
        data: { link_with: record.id },
      });
      notify("User linked successfully", { type: "success" });
      handleClose();
      // Refresh the current view
      window.location.reload();
    } catch (error) {
      console.error("Error linking users:", error);
      notify("Error linking users", { type: "error" });
    }
  };

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<LinkIcon />}
        onClick={handleOpen}
        sx={{ mt: 2 }}
      >
        Link User
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Link User</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Search for a user to link this user to
          </Typography>

          <Box sx={{ display: "flex", mb: 2 }}>
            <MuiTextField
              label="Search by email"
              variant="outlined"
              fullWidth
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyPress={handleKeyPress}
              sx={{ mr: 1 }}
            />
            <Button
              variant="contained"
              onClick={handleSearch}
              startIcon={<SearchIcon />}
              disabled={searching || !searchText.trim()}
            >
              Search
            </Button>
          </Box>

          {searching ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
              <CircularProgress />
            </Box>
          ) : searchResults.length > 0 ? (
            <List sx={{ width: "100%" }}>
              {searchResults.map((user) => (
                <ListItem
                  component="button"
                  key={user.id}
                  onClick={() => handleLinkUser(user.id)}
                  divider
                >
                  <ListItemText
                    primary={user.email || user.phone_number || user.id}
                    secondary={`ID: ${user.id} | Connection: ${user.connection}`}
                  />
                </ListItem>
              ))}
            </List>
          ) : searchText && !searching ? (
            <Typography color="textSecondary" align="center" sx={{ p: 2 }}>
              No users found
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const UnlinkButton = () => {
  const [open, setOpen] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const identity = useRecordContext();

  // Get the user ID from the route params
  const { id: userId } = useParams();

  if (!identity || !userId || identity.provider === "auth0") {
    // Don't allow unlinking the primary identity
    return null;
  }

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleUnlink = async () => {
    try {
      // Create the endpoint URL with proper parameters
      const endpoint = `users/${userId}/identities/${identity.provider}/${identity.user_id}`;

      await dataProvider.delete(endpoint, {
        id: "stuff",
      });
      notify("Identity unlinked successfully", { type: "success" });
      handleClose();
      refresh();
    } catch (error) {
      console.error("Error unlinking identity:", error);
      notify("Error unlinking identity", { type: "error" });
    }
  };

  return (
    <>
      <Tooltip title="Unlink identity">
        <IconButton onClick={handleOpen} color="error" size="small">
          <LinkOffIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Unlink Identity</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to unlink this identity ({identity.provider}/
            {identity.user_id})? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleUnlink} color="error" autoFocus>
            Unlink
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const AddPermissionButton = () => {
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

  // Get the user ID from the URL path
  const urlPath = window.location.pathname;
  const matches = urlPath.match(/\/([^/]+)\/users\/([^/]+)/);
  const userId = matches ? matches[2] : null;

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

      // Fetch the user's existing permissions from /users/:id/permissions
      const existingRes = await dataProvider.getList(
        `users/${userId}/permissions`,
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

      // Filter out scopes the user already has
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
    if (!userId || selectedPermissions.length === 0) {
      notify("Please select at least one permission", { type: "warning" });
      return;
    }

    try {
      // Send permissions in a single payload as an array
      const payload = {
        permissions: selectedPermissions.map((permission: any) => ({
          permission_name: permission.permission_name,
          resource_server_identifier: selectedResourceServer.identifier,
        })),
      };

      await dataProvider.create(`users/${userId}/permissions`, {
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

  if (!userId) {
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
        Add Permission
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Add Permissions</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Select a resource server and permissions to assign to this user
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
              </Box>

              {!loadingPermissions && availablePermissions.length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  This user already has all available scopes for the selected
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

const RemovePermissionButton = () => {
  const [open, setOpen] = useState(false);
  const permission = useRecordContext();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  // Get the user id from the route params (e.g. /:tenantId/users/:id)
  const { id: userId } = useParams();

  if (!permission || !userId) {
    return null;
  }

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleRemove = async () => {
    try {
      // Build the permission id and URL-encode it for safe path usage
      const permissionId = encodeURIComponent(
        `${permission.resource_server_identifier}:${permission.permission_name}`,
      );

      await dataProvider.delete(`users/${userId}/permissions`, {
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
      <Tooltip title="Remove permission">
        <IconButton onClick={handleOpen} color="error" size="small">
          <DeleteIcon />
        </IconButton>
      </Tooltip>

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

// Custom component to display user roles with organization context
const UserRolesTable = ({
  onRolesChanged,
}: {
  onRolesChanged?: () => void;
}) => {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const { id: userId } = useParams();

  const loadRolesAndOrganizations = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // Load user organizations first
      const orgsRes = await dataProvider.getList(
        `users/${userId}/organizations`,
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      const userOrganizations = orgsRes?.data ?? [];

      // Load global roles
      const globalRolesRes = await dataProvider.getList(
        `users/${userId}/roles`,
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      const globalRoles = (globalRolesRes?.data ?? []).map((role: any) => ({
        ...role,
        organization_id: null,
        organization_name: "Global",
        role_context: "global",
      }));

      // Load organization-specific roles
      const orgRoles: any[] = [];
      for (const org of userOrganizations) {
        try {
          const orgRolesRes = await dataProvider.getList(
            `organizations/${org.id}/members/${userId}/roles`,
            {
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "name", order: "ASC" },
              filter: {},
            },
          );
          const rolesWithOrg = (orgRolesRes?.data ?? []).map((role: any) => ({
            ...role,
            organization_id: org.id,
            organization_name: org.display_name || org.name || org.id,
            role_context: "organization",
          }));
          orgRoles.push(...rolesWithOrg);
        } catch (error) {
          console.error(
            `Error loading roles for organization ${org.id}:`,
            error,
          );
        }
      }

      // Combine global and organization roles and deduplicate
      const allRoles = [...globalRoles, ...orgRoles];

      // Deduplicate roles by creating a unique key combining role ID and organization context
      const roleMap = new Map();
      allRoles.forEach((role) => {
        const key = `${role.id}-${role.organization_id || "global"}`;
        roleMap.set(key, role);
      });
      const deduplicatedRoles = Array.from(roleMap.values());

      setRoles(deduplicatedRoles);
    } catch (error) {
      console.error("Error loading roles and organizations:", error);
      notify("Error loading roles", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRole = async (role: any) => {
    try {
      if (role.role_context === "global") {
        // Remove global role
        await dataProvider.delete(`users/${userId}/roles`, {
          id: role.id,
          previousData: role,
        });
      } else {
        // Remove organization-specific role using the dataProvider
        await dataProvider.delete(
          `organizations/${role.organization_id}/members/${userId}/roles`,
          {
            id: role.id,
            previousData: { id: role.id, roles: [role.id] },
          },
        );
      }
      notify("Role removed successfully", { type: "success" });
      loadRolesAndOrganizations(); // Refresh the table
      refresh();
      onRolesChanged?.();
    } catch (error) {
      console.error("Error removing role:", error);
      notify("Error removing role", { type: "error" });
    }
  };

  useEffect(() => {
    loadRolesAndOrganizations();
  }, [userId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                borderBottom: "1px solid #ddd",
              }}
            >
              Role
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                borderBottom: "1px solid #ddd",
              }}
            >
              Description
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                borderBottom: "1px solid #ddd",
              }}
            >
              Organization
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                borderBottom: "1px solid #ddd",
              }}
            >
              ID
            </th>
            <th
              style={{
                padding: "12px",
                textAlign: "left",
                borderBottom: "1px solid #ddd",
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr
              key={`${role.id}-${role.organization_id || "global"}`}
              style={{ borderBottom: "1px solid #eee" }}
            >
              <td style={{ padding: "12px" }}>{role.name}</td>
              <td style={{ padding: "12px" }}>{role.description || "-"}</td>
              <td style={{ padding: "12px" }}>
                <span
                  style={{
                    color: role.role_context === "global" ? "#666" : "#1976d2",
                    fontStyle:
                      role.role_context === "global" ? "italic" : "normal",
                  }}
                >
                  {role.organization_name}
                </span>
              </td>
              <td
                style={{
                  padding: "12px",
                  fontFamily: "monospace",
                  fontSize: "0.9em",
                }}
              >
                {role.id}
              </td>
              <td style={{ padding: "12px" }}>
                <IconButton
                  onClick={() => handleRemoveRole(role)}
                  color="error"
                  size="small"
                  title="Remove Role"
                >
                  <DeleteIcon />
                </IconButton>
              </td>
            </tr>
          ))}
          {roles.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ padding: "24px", textAlign: "center", color: "#666" }}
              >
                No roles assigned
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Box>
  );
};

// Add roles management: add roles and remove roles for a user
const AddRoleButton = ({ onRolesChanged }: { onRolesChanged?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<any[]>([]);
  const [userOrganizations, setUserOrganizations] = useState<any[]>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  const { id: userId } = useParams();

  // Global option for the organization dropdown
  const globalOption = {
    id: "global",
    name: "Global (No Organization)",
    display_name: "Global Roles",
  };

  const handleOpen = async () => {
    setOpen(true);
    await loadUserOrganizations();
    setSelectedOrganization(globalOption); // Default to global
    await loadRoles(null); // Load global roles by default
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedRoles([]);
    setSelectedOrganization(null);
    setUserOrganizations([]);
  };

  const loadUserOrganizations = async () => {
    if (!userId) return;
    try {
      const res = await dataProvider.getList(`users/${userId}/organizations`, {
        pagination: { page: 1, perPage: 1000 },
        sort: { field: "name", order: "ASC" },
        filter: {},
      });
      setUserOrganizations(res?.data ?? []);
    } catch (error) {
      console.error("Error loading user organizations:", error);
      // Don't show error notification as this is not critical
    }
  };

  const loadRoles = async (organizationId: string | null = null) => {
    if (!userId) return;
    setLoading(true);
    try {
      let allRoles: any[] = [];
      let assignedRoles: any[] = [];

      if (organizationId && organizationId !== "global") {
        // Load organization roles
        const allRes = await dataProvider.getList(
          `organizations/${organizationId}/roles`,
          {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          },
        );
        allRoles = allRes?.data ?? [];

        // Load roles already assigned to user in this organization
        const assignedRes = await dataProvider.getList(
          `organizations/${organizationId}/members/${userId}/roles`,
          {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          },
        );
        assignedRoles = assignedRes?.data ?? [];
      } else {
        // Load global roles
        const allRes = await dataProvider.getList("roles", {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        });
        allRoles = allRes?.data ?? [];

        // Load roles already assigned to user globally
        const assignedRes = await dataProvider.getList(
          `users/${userId}/roles`,
          {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          },
        );
        assignedRoles = assignedRes?.data ?? [];
      }

      const assignedSet = new Set(assignedRoles.map((r: any) => r.id));
      const available = allRoles.filter((r: any) => !assignedSet.has(r.id));
      setAvailableRoles(available);
    } catch (error) {
      console.error("Error loading roles:", error);
      notify("Error loading roles", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizationChange = (organization: any) => {
    setSelectedOrganization(organization);
    setSelectedRoles([]);
    const orgId = organization?.id === "global" ? null : organization?.id;
    loadRoles(orgId);
  };

  const handleAddRoles = async () => {
    if (!userId || selectedRoles.length === 0) {
      notify("Please select at least one role", { type: "warning" });
      return;
    }

    try {
      const payload = { roles: selectedRoles.map((r: any) => r.id) };

      if (selectedOrganization?.id === "global") {
        // Add global roles
        await dataProvider.create(`users/${userId}/roles`, { data: payload });
      } else {
        // Add organization-specific roles
        await dataProvider.create(
          `organizations/${selectedOrganization.id}/members/${userId}/roles`,
          {
            data: payload,
          },
        );
      }

      const context =
        selectedOrganization?.id === "global"
          ? "globally"
          : `to organization "${selectedOrganization?.name}"`;
      notify(`${selectedRoles.length} role(s) added ${context} successfully`, {
        type: "success",
      });
      handleClose();
      refresh();
      onRolesChanged?.();
    } catch (error) {
      console.error("Error adding roles:", error);
      notify("Error adding roles", { type: "error" });
    }
  };

  if (!userId) return null;

  // Create organization options: global + user's organizations
  const organizationOptions = [globalOption, ...userOrganizations];
  const showOrganizationDropdown = userOrganizations.length > 0;

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={handleOpen}
        sx={{ mb: 2 }}
      >
        Add Role
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Add Roles</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Select one or more roles to assign to this user
          </Typography>

          {showOrganizationDropdown && (
            <Box sx={{ mb: 3 }}>
              <Autocomplete
                options={organizationOptions}
                getOptionLabel={(option) =>
                  option.display_name || option.name || option.id
                }
                value={selectedOrganization}
                onChange={(_, value) => handleOrganizationChange(value)}
                isOptionEqualToValue={(option, value) =>
                  option?.id === value?.id
                }
                renderInput={(params) => (
                  <MuiTextField
                    {...params}
                    label="Organization"
                    variant="outlined"
                    fullWidth
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {option.display_name || option.name || option.id}
                      </Typography>
                      {option.id === "global" ? (
                        <Typography variant="caption" color="text.secondary">
                          Roles that apply across all organizations
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Organization ID: {option.id}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
              />
            </Box>
          )}

          <Autocomplete
            multiple
            options={availableRoles}
            getOptionLabel={(option) => option.name || option.id}
            value={selectedRoles}
            onChange={(_, value) => setSelectedRoles(value)}
            loading={loading}
            isOptionEqualToValue={(option, value) => option?.id === value?.id}
            renderInput={(params) => (
              <MuiTextField
                {...params}
                label="Roles"
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
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {option.name || option.id}
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

          {!loading && availableRoles.length === 0 && selectedOrganization && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              This user already has all available roles{" "}
              {selectedOrganization.id === "global"
                ? "globally"
                : `in "${selectedOrganization.name}"`}
              .
            </Typography>
          )}

          {selectedOrganization && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: "block" }}
            >
              {selectedOrganization.id === "global"
                ? "These roles will be assigned globally (not tied to any specific organization)"
                : `These roles will be assigned within the "${selectedOrganization.name}" organization`}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAddRoles}
            variant="contained"
            disabled={selectedRoles.length === 0 || !selectedOrganization}
          >
            Add {selectedRoles.length} Role(s)
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// Combined component for roles management
const RolesManagement = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRolesChanged = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <>
      <AddRoleButton onRolesChanged={handleRolesChanged} />
      <UserRolesTable key={refreshKey} onRolesChanged={handleRolesChanged} />
    </>
  );
};

export function UserEdit() {
  return (
    <Edit>
      <SimpleShowLayout>
        <TextField source="email" />
        <TextField source="id" />
      </SimpleShowLayout>
      <TabbedForm>
        <TabbedForm.Tab label="details">
          <Stack spacing={2} direction="row">
            <TextInput source="email" sx={{ mb: 4 }} />
            <TextInput source="phone_number" sx={{ mb: 4 }} />
            <Labeled label={<FieldTitle source="id" />}>
              <TextField source="id" sx={{ mb: 4 }} />
            </Labeled>
          </Stack>
          <Stack spacing={2} direction="row">
            <TextInput source="given_name" />
            <TextInput source="family_name" />
            <TextInput source="nickname" />
          </Stack>
          <Stack spacing={2} direction="row">
            <TextInput source="name" />
            <Labeled label={<FieldTitle source="connection" />}>
              <TextField source="connection" />
            </Labeled>
          </Stack>
          <TextInput source="picture" />
          <ArrayField source="identities">
            <Datagrid bulkActionButtons={false} sx={{ my: 4 }} rowClick="">
              <TextField source="connection" />
              <TextField source="provider" />
              <TextField source="user_id" />
              <BooleanField source="isSocial" />
              <UnlinkButton />
            </Datagrid>
          </ArrayField>

          <LinkUserButton />

          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="sessions">
          <ReferenceManyField
            reference="sessions"
            target="user_id"
            pagination={<Pagination />}
            perPage={10}
            sort={{ field: "used_at", order: "DESC" }}
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
              rowClick="edit"
              empty={<div>No active sessions found</div>}
            >
              <TextField source="id" sortable={true} />
              <DateField
                source="used_at"
                showTime={true}
                emptyText="-"
                sortable={true}
              />
              <DateField
                source="idle_expires_at"
                showTime={true}
                sortable={true}
              />
              <TextField
                source="device.last_ip"
                label="IP Address"
                emptyText="-"
                sortable={false}
              />
              <TextField
                source="device.last_user_agent"
                label="User Agent"
                emptyText="-"
                sortable={false}
              />
              <FunctionField
                label="Client IDs"
                render={(record) =>
                  record.clients ? record.clients.join(", ") : "-"
                }
                sortable={false}
              />
              <DateField source="created_at" showTime={true} sortable={true} />
              <FunctionField
                label="Status"
                render={(record) => (record.revoked_at ? "Revoked" : "Active")}
                sortable={false}
              />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="logs">
          <ReferenceManyField
            reference="logs"
            target="userId"
            pagination={<Pagination />}
            sort={{ field: "date", order: "DESC" }}
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
              rowClick="show"
            >
              <FunctionField
                source="success"
                render={(record: any) => <LogIcon type={record.type} />}
              />
              <FunctionField
                source="type"
                render={(record: any) => <LogType type={record.type} />}
              />
              <FunctionField
                source="date"
                render={(record: any) => <DateAgo date={record.date} />}
                sortable={true}
              />
              <TextField source="description" />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="permissions">
          <AddPermissionButton />
          <ReferenceManyField
            reference="permissions"
            target="user_id"
            pagination={<Pagination />}
            sort={{ field: "permission_name", order: "ASC" }}
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
              <RemovePermissionButton />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="roles">
          <RolesManagement />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="organizations">
          <ReferenceManyField
            reference="user-organizations"
            target="user_id"
            pagination={<Pagination />}
            sort={{ field: "name", order: "ASC" }}
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
              rowClick={(_, __, record) => `/organizations/${record.id}`}
              bulkActionButtons={false}
            >
              <TextField source="name" label="Organization Name" />
              <TextField source="display_name" label="Display Name" />
              <TextField source="id" label="Organization ID" />
              <FunctionField
                source="metadata"
                render={(record: any) => {
                  const metadata = record.metadata || {};
                  const metadataCount = Object.keys(metadata).length;
                  return metadataCount > 0
                    ? `${metadataCount} properties`
                    : "-";
                }}
                label="Metadata"
              />
              <FunctionField
                label="Joined"
                render={(record: any) =>
                  record.created_at ? <DateAgo date={record.created_at} /> : "-"
                }
              />
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
