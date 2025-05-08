import {
  List,
  Datagrid,
  TextField,
  DateField,
  UrlField,
  SimpleList,
  TextInput,
  useListContext,
} from "react-admin";
import { useMediaQuery } from "@mui/material";
import { PostListActions } from "../listActions/PostListActions";

// Use the standard List component but with proper logging
export function TenantsList(props) {
  console.log(
    "TenantsList component rendering on path:",
    window.location.pathname,
  );
  const isSmall = useMediaQuery((theme: any) => theme.breakpoints.down("sm"));

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
          linkType={(record) => `/${record.id}`}
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
        </Datagrid>
      )}
    </List>
  );
}
