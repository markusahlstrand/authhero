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
} from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";
import { useState } from "react";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SearchIcon from "@mui/icons-material/Search";

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

  // Get the user ID from the URL path - this approach works better with the multi-tenant structure
  const urlPath = window.location.pathname;
  const matches = urlPath.match(/\/([^/]+)\/users\/([^/]+)/);
  const userId = matches ? matches[2] : null;

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
              <TextField source="resource_server_identifier" label="Resource Server" />
              <TextField source="resource_server_name" label="Resource Name" />
              <TextField source="permission_name" label="Permission" />
              <TextField source="description" label="Description" />
              <FunctionField
                source="created_at"
                render={(record: any) => record.created_at ? <DateAgo date={record.created_at} /> : "-"}
                label="Assigned"
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
