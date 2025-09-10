import {
  Edit,
  TextInput,
  required,
  TabbedForm,
  ReferenceManyField,
  Datagrid,
  Pagination,
  TextField,
  DateField,
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
import { useParams } from "react-router-dom";

const AddOrganizationMemberButton = () => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  // Get organization id from the route params (/:tenantId/organizations/:id)
  const { id: organizationId } = useParams();

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    try {
      // Fetch all users to allow selection
      const { data } = await dataProvider.getList("users", {
        pagination: { page: 1, perPage: 100 },
        sort: { field: "name", order: "ASC" },
        filter: {},
      });
      setUsers(data);
    } catch (error) {
      notify("Error loading users", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedUsers([]);
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

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Add Members to Organization</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Select users to add as members of this organization.
          </DialogContentText>

          {loading ? (
            <Box display="flex" justifyContent="center" p={2}>
              <CircularProgress />
            </Box>
          ) : (
            <Autocomplete
              multiple
              options={users}
              getOptionLabel={(option) =>
                `${option.name || option.email} (${option.email})`
              }
              value={selectedUsers}
              onChange={(_, newValue) => setSelectedUsers(newValue)}
              renderInput={(params) => (
                <MuiTextField
                  {...params}
                  label="Select Users"
                  placeholder="Choose users to add..."
                />
              )}
              sx={{ mt: 2 }}
            />
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
          <TextField source="user.name" label="Name" />
          <TextField source="user.email" label="Email" />
          <DateField source="created_at" label="Added" showTime />
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
