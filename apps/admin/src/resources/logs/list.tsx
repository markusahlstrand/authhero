import { List, DataTable, TextInput, SelectInput } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { LogIcon } from "./LogIcon";
import { LogType } from "./LogType";
import { LogTypes } from "@/lib/logs";
import { DateAgo } from "@/common/DateAgo";

const typeChoices = Object.entries({
  [LogTypes.SUCCESS_LOGIN]: "Success Login",
  [LogTypes.FAILED_LOGIN]: "Failed Login",
  [LogTypes.SUCCESS_SIGNUP]: "Success Signup",
  [LogTypes.FAILED_SIGNUP]: "Failed Signup",
  [LogTypes.SUCCESS_LOGOUT]: "Success Logout",
  [LogTypes.SUCCESS_SILENT_AUTH]: "Success Silent Auth",
  [LogTypes.FAILED_SILENT_AUTH]: "Failed Silent Auth",
  [LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN]:
    "Success Code Exchange",
  [LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN]:
    "Failed Code Exchange",
  [LogTypes.SUCCESS_API_OPERATION]: "Success API Operation",
  [LogTypes.FAILED_API_OPERATION]: "Failed API Operation",
  [LogTypes.CODE_LINK_SENT]: "Code/Link Sent",
  [LogTypes.SUCCESS_CHANGE_EMAIL]: "Success Change Email",
  [LogTypes.FAILED_CHANGE_EMAIL]: "Failed Change Email",
  [LogTypes.SUCCESS_CHANGE_PASSWORD]: "Success Change Password",
  [LogTypes.FAILED_CHANGE_PASSWORD]: "Failed Change Password",
}).map(([id, name]) => ({ id, name }));

const statusChoices = [
  { id: "true", name: "Success" },
  { id: "false", name: "Failed" },
];

const filters = [
  <TextInput key="ip" source="ip" placeholder="IP" label="IP" />,
  <SelectInput key="type" source="type" choices={typeChoices} />,
  <SelectInput key="success" source="success" choices={statusChoices} />,
];

function LogIconCell() {
  const record = useRecordContext<{ type: string }>();
  if (!record) return null;
  return <LogIcon type={record.type} />;
}

function LogTypeCell() {
  const record = useRecordContext<{ type: string }>();
  if (!record) return null;
  return <LogType type={record.type as never} />;
}

function LogDateCell() {
  const record = useRecordContext<{ date: string }>();
  if (!record) return null;
  return <DateAgo date={record.date} />;
}

export function LogsList() {
  return (
    <List filters={filters} sort={{ field: "date", order: "DESC" }}>
      <DataTable rowClick="show">
        <DataTable.Col label="">
          <LogIconCell />
        </DataTable.Col>
        <DataTable.Col label="Type">
          <LogTypeCell />
        </DataTable.Col>
        <DataTable.Col label="When">
          <LogDateCell />
        </DataTable.Col>
        <DataTable.Col source="description" />
      </DataTable>
    </List>
  );
}
