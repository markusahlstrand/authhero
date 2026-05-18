import {
  DataTable,
  FilterButton,
  FilterForm,
  ListPagination,
  ReferenceManyField,
  SelectInput,
  TextField,
  TextInput,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { LogIcon } from "../../logs/LogIcon";
import { LogType } from "../../logs/LogType";
import { LogTypes } from "@/lib/logs";
import { DateAgo } from "@/common/DateAgo";

interface LogRecord {
  id: string;
  type: string;
  date?: string;
  description?: string;
}

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

const logFilters = [
  <TextInput
    key="q"
    source="q"
    placeholder="Search"
    label="Search"
    alwaysOn
  />,
  <TextInput key="ip" source="ip" placeholder="IP" label="IP" />,
  <SelectInput key="success" source="success" choices={statusChoices} />,
  <SelectInput key="type" source="type" choices={typeChoices} />,
];

function LogIconCell() {
  const record = useRecordContext<LogRecord>();
  if (!record) return null;
  return <LogIcon type={record.type} />;
}

function LogTypeCell() {
  const record = useRecordContext<LogRecord>();
  if (!record) return null;
  return <LogType type={record.type as never} />;
}

function LogDateCell() {
  const record = useRecordContext<LogRecord>();
  if (!record) return null;
  return <DateAgo date={record.date} />;
}

export function LogsTab() {
  return (
    <ReferenceManyField
      reference="logs"
      target="user_id"
      sort={{ field: "date", order: "DESC" }}
      pagination={<ListPagination />}
      empty={
        <p className="text-sm text-muted-foreground py-4">No logs found</p>
      }
    >
      <div className="flex flex-row items-end gap-2 mb-2 flex-wrap">
        <FilterForm filters={logFilters} />
        <FilterButton filters={logFilters} resource="logs" />
      </div>
      <DataTable rowClick="show" bulkActionButtons={false}>
        <DataTable.Col label="">
          <LogIconCell />
        </DataTable.Col>
        <DataTable.Col label="Type">
          <LogTypeCell />
        </DataTable.Col>
        <DataTable.Col label="When">
          <LogDateCell />
        </DataTable.Col>
        <DataTable.Col label="Description">
          <TextField source="description" />
        </DataTable.Col>
      </DataTable>
    </ReferenceManyField>
  );
}
