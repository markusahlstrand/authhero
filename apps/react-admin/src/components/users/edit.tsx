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
} from "react-admin";
import { LogType, LogIcon } from "../logs";
import { DateAgo } from "../common";
import { Stack } from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";

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
              rowClick="show"
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
