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
} from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";
import { useState } from "react";
import LinkIcon from "@mui/icons-material/Link";
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

  if (!record) {
    return null;
  }

  const handleLinkUser = async (userId) => {
    try {
      await dataProvider.create(`users/${record.id}/identities`, {
        data: { link_with: userId },
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
            Search for a user to link to {record.email || record.user_id}
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
            <Labeled label={<FieldTitle source="email" />}>
              <TextField source="email" sx={{ mb: 4 }} />
            </Labeled>
            <Labeled label={<FieldTitle source="name" />}>
              <TextField source="name" sx={{ mb: 4 }} />
            </Labeled>
            <Labeled label={<FieldTitle source="id" />}>
              <TextField source="id" sx={{ mb: 4 }} />
            </Labeled>
          </Stack>
          <Stack spacing={2} direction="row">
            <TextInput source="given_name" />
            <TextInput source="family_name" />
            <TextInput source="nickname" />
          </Stack>
          <TextInput source="picture" />
          <ArrayField source="identities">
            <Datagrid bulkActionButtons={false} sx={{ my: 4 }}>
              <TextField source="connection" />
              <TextField source="provider" />
              <TextField source="user_id" />
              <BooleanField source="isSocial" />
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
            target="_"
            pagination={<Pagination />}
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
              sort={{ field: "used_at", order: "DESC" }}
              rowClick="edit"
              empty={<div>No active sessions found</div>}
            >
              <TextField source="id" />
              <DateField source="used_at" showTime={true} emptyText="-" />
              <DateField source="idle_expires_at" showTime={true} />
              <TextField
                source="device.last_ip"
                label="IP Address"
                emptyText="-"
              />
              <TextField
                source="device.last_user_agent"
                label="User Agent"
                emptyText="-"
              />
              <FunctionField
                label="Client IDs"
                render={(record) =>
                  record.clients ? record.clients.join(", ") : "-"
                }
              />
              <DateField source="created_at" showTime={true} />
              <FunctionField
                label="Status"
                render={(record) => (record.revoked_at ? "Revoked" : "Active")}
              />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="logs">
          <ReferenceManyField
            reference="logs"
            target="userId"
            pagination={<Pagination />}
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
              sort={{ field: "timestamp", order: "DESC" }}
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
              />
              <TextField source="description" />
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
