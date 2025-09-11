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
  useRedirect,
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
  CircularProgress,
  IconButton,
  TextField as MuiTextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Checkbox,
  Chip,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useParams } from "react-router-dom";

const AddOrganizationMemberButton = () => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  // Get organization id from the route params (/:tenantId/organizations/:id)
  const { id: organizationId } = useParams();

  const toggleUserSelection = (user: any) => {
    const isSelected = selectedUsers.some(
      (selected) => selected.user_id === user.user_id,
    );
    if (isSelected) {
      setSelectedUsers(
        selectedUsers.filter((selected) => selected.user_id !== user.user_id),
      );
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const removeSelectedUser = (userToRemove: any) => {
    setSelectedUsers(
      selectedUsers.filter((user) => user.user_id !== userToRemove.user_id),
    );
  };

  const selectAllUsers = () => {
    setSelectedUsers([...users]);
  };

  const clearAllUsers = () => {
    setSelectedUsers([]);
  };

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setSearchLoading(true);
    try {
      // Search users by email, name, or user_id
      const { data } = await dataProvider.getList("users", {
        pagination: { page: 1, perPage: 50 },
        sort: { field: "email", order: "ASC" },
        filter: { q: query },
      });

      // Get existing organization members to filter them out
      if (organizationId) {
        try {
          // Use getManyReference to get organization members
          const existingMembers = await dataProvider.getManyReference(
            "organization-members",
            {
              target: "organization_id",
              id: organizationId,
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "user_id", order: "ASC" },
              filter: {},
            },
          );

          const existingUserIds = new Set(
            existingMembers.data.map((member: any) => member.user_id),
          );

          // Filter out users who are already members
          const availableUsers = data.filter(
            (user: any) => !existingUserIds.has(user.user_id),
          );
          setUsers(availableUsers);
        } catch (memberError) {
          // If we can't get members, just show all users
          console.warn("Could not fetch existing members:", memberError);
          setUsers(data);
        }
      } else {
        setUsers(data);
      }
    } catch (error) {
      notify("Error searching users", { type: "error" });
      setUsers([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search function
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );

  const handleSearchChange = (value: string) => {
    setSearchText(value);

    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      searchUsers(value);
    }, 300); // 300ms delay

    setSearchTimeout(timeout);
  };

  const handleOpen = () => {
    setOpen(true);
    setUsers([]);
    setSearchText("");
    setSelectedUsers([]);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedUsers([]);
    setUsers([]);
    setSearchText("");
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
  };

  const handleAddMembers = async () => {
    if (!organizationId || selectedUsers.length === 0) return;

    try {
      // Add each selected user to the organization
      for (const user of selectedUsers) {
        await dataProvider.create("organization-members", {
          data: {
            organization_id: organizationId,
            user_id: user.user_id,
          },
        });
      }

      notify(`Added ${selectedUsers.length} member(s) to organization`, {
        type: "success",
      });
      refresh();
      handleClose();
    } catch (error) {
      notify("Error adding members to organization", { type: "error" });
    }
  };

  return (
    <>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleOpen}
        sx={{ mb: 2 }}
      >
        Add Members
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Add Members to Organization</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Search and select users to add as members of this organization.
          </DialogContentText>

          {/* Search Field */}
          <MuiTextField
            fullWidth
            label="Search Users"
            placeholder="Search by email, name, or user ID..."
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: searchLoading && <CircularProgress size={20} />,
            }}
          />

          {/* Selected Users Display */}
          {selectedUsers.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Selected Users ({selectedUsers.length})
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {selectedUsers.map((user) => (
                  <Chip
                    key={user.user_id}
                    label={`${user.name || user.email || user.user_id}`}
                    onDelete={() => removeSelectedUser(user)}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Box>
          )}

          {/* User Search Results */}
          {users.length > 0 ? (
            <>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Found {users.length} available user
                  {users.length !== 1 ? "s" : ""}
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    size="small"
                    onClick={selectAllUsers}
                    disabled={selectedUsers.length === users.length}
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    onClick={clearAllUsers}
                    disabled={selectedUsers.length === 0}
                  >
                    Clear All
                  </Button>
                </Box>
              </Box>
              <Box
                sx={{
                  maxHeight: 300,
                  overflow: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <List dense>
                  {users.map((user) => {
                    const isSelected = selectedUsers.some(
                      (selected) => selected.user_id === user.user_id,
                    );
                    return (
                      <ListItem key={user.user_id} disablePadding>
                        <ListItemButton
                          onClick={() => toggleUserSelection(user)}
                          sx={{
                            "&:hover": { backgroundColor: "action.hover" },
                            backgroundColor: isSelected
                              ? "action.selected"
                              : "transparent",
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            tabIndex={-1}
                            disableRipple
                            sx={{ mr: 1 }}
                          />
                          <ListItemText
                            primary={
                              <Typography variant="body2" fontWeight="medium">
                                {user.name || user.email || user.user_id}
                              </Typography>
                            }
                            secondary={
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {user.email} • {user.user_id}
                              </Typography>
                            }
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            </>
          ) : searchText.trim() ? (
            <Box textAlign="center" py={3}>
              {searchLoading ? (
                <CircularProgress />
              ) : (
                <Typography color="text.secondary">
                  No users found matching "{searchText}"
                </Typography>
              )}
            </Box>
          ) : (
            <Box textAlign="center" py={3}>
              <Typography color="text.secondary">
                Start typing to search for users
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleAddMembers}
            variant="contained"
            disabled={selectedUsers.length === 0}
          >
            Add Members
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const RemoveMemberButton = ({ record }: { record: any }) => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const { id: organizationId } = useParams();

  const handleRemoveMember = async () => {
    if (!organizationId || !record?.user_id) return;

    try {
      await dataProvider.delete("organization-members", {
        id: `${organizationId}_${record.user_id}`,
        previousData: record,
      });

      notify("Member removed from organization", { type: "success" });
      refresh();
    } catch (error) {
      notify("Error removing member from organization", { type: "error" });
    }
  };

  return (
    <IconButton
      onClick={handleRemoveMember}
      color="error"
      size="small"
      title="Remove from organization"
    >
      <DeleteIcon />
    </IconButton>
  );
};

const OrganizationGeneralTab = () => (
  <Box>
    <TextInput source="name" validate={[required()]} fullWidth />
    <TextInput source="display_name" fullWidth />
    <TextInput source="description" multiline fullWidth />
  </Box>
);

const OrganizationMembersTab = () => {
  const record = useRecordContext();
  const redirect = useRedirect();

  if (!record?.id) {
    return (
      <Typography>Save the organization first to manage members.</Typography>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Organization Members
      </Typography>

      <AddOrganizationMemberButton />

      <ReferenceManyField
        reference="organization-members"
        target="organization_id"
        pagination={<Pagination />}
      >
        <Datagrid bulkActionButtons={false}>
          <FunctionField
            label="User ID"
            render={(record) => (
              <Button
                variant="text"
                onClick={() => redirect("edit", "users", record.user_id)}
                sx={{
                  textTransform: "none",
                  p: 0,
                  minWidth: "auto",
                  color: "primary.main",
                  textDecoration: "underline",
                  "&:hover": {
                    textDecoration: "underline",
                    backgroundColor: "transparent",
                  },
                }}
              >
                {record.user_id}
              </Button>
            )}
          />
          <TextField source="email" label="Email" />
          <FunctionField
            label="Roles"
            render={(record) => (
              <Typography variant="body2">
                {record.roles?.length > 0
                  ? record.roles
                      .map((role: any) => role.name || role.id)
                      .join(", ")
                  : "No roles assigned"}
              </Typography>
            )}
          />
          <FunctionField
            label="Actions"
            render={(record) => <RemoveMemberButton record={record} />}
          />
        </Datagrid>
      </ReferenceManyField>
    </Box>
  );
};

export function OrganizationEdit() {
  return (
    <Edit>
      <TabbedForm>
        <TabbedForm.Tab label="General">
          <OrganizationGeneralTab />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Members">
          <OrganizationMembersTab />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
