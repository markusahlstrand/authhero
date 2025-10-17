import {
  List,
  Datagrid,
  TextField,
  DateField,
  UrlField,
  SimpleList,
  TextInput,
} from "react-admin";
import { useMediaQuery } from "@mui/material";
import { PostListActions } from "../listActions/PostListActions";

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
          primaryText={(record) => record.friendly_name}
          secondaryText={(record) => record.id}
          linkType={false}
          onClick={(record: any) => {
            handleTenantNavigation(String(record.id));
          }}
        />
      ) : (
        <Datagrid
          rowClick={(_id, _resource, record) => {
            handleTenantNavigation(String(record.id));
            return "";
          }}
          bulkActionButtons={false}
          rowSx={(tenant) => ({
            ...(tenant.id === "DEFAULT_SETTINGS" && {
              backgroundColor: "#f0f0f0",
            }),
          })}
        >
          <TextField source="friendly_name" label="Name" />
          <UrlField source="id" />
          <TextField source="audience" />
          <DateField source="created_at" showTime={true} />
          <DateField source="updated_at" showTime={true} />
          <TextField source="support_url" label="Support Url" />
        </Datagrid>
      )}
    </List>
  );
}
