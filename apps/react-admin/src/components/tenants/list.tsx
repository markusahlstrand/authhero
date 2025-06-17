import {
  List,
  Datagrid,
  TextField,
  DateField,
  UrlField,
  SimpleList,
  TextInput,
  FunctionField,
} from "react-admin";
import { useMediaQuery, IconButton } from "@mui/material";
import { PostListActions } from "../listActions/PostListActions";
import { Settings as SettingsIcon } from "@mui/icons-material";

// Use the standard List component but with proper logging
export function TenantsList(props) {
  const isSmall = useMediaQuery((theme: any) => theme.breakpoints.down("sm"));

  // Handle navigation to tenant-specific view
  const handleTenantNavigation = (tenantId: string) => {
    // Navigate to the tenant-specific view by changing the full URL
    // This will trigger the root router to switch to the tenant-specific BrowserRouter
    window.location.href = `/${tenantId}`;
  };

  // The standard filters
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
  ];

  return (
    <List
      resource={props.resource || "tenants"}
      actions={<PostListActions />}
      filters={postFilters}
    >
      {isSmall ? (
        <SimpleList
          primaryText={(record) => record.name}
          secondaryText={(record) => record.id}
          linkType="edit"
        />
      ) : (
        <Datagrid
          rowClick="edit"
          bulkActionButtons={false}
          rowSx={(tenant) => ({
            ...(tenant.id === "DEFAULT_SETTINGS" && {
              backgroundColor: "#f0f0f0",
            }),
          })}
        >
          <TextField source="name" />
          <UrlField source="id" />
          <TextField source="audience" />
          <DateField source="created_at" showTime={true} />
          <DateField source="updated_at" showTime={true} />
          <TextField source="support_url" label="Support Url" />
          <FunctionField
            label="Manage"
            render={(record: any) => (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation(); // Prevent row click
                  handleTenantNavigation(record.id);
                }}
                size="small"
                title={`Manage tenant ${record.name || record.id}`}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            )}
          />
        </Datagrid>
      )}
    </List>
  );
}
