import type { ReactNode } from "react";
import { DataTable, SelectInput, TextInput } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { LogIcon } from "./LogIcon";
import { LogType } from "./LogType";
import { LogTypes, getLogTypeDescription } from "@/lib/logs";
import { DateAgo } from "@/common/DateAgo";

// Curated subset shown in the filter dropdown — labels resolve from the shared
// description map so adding/renaming codes only happens in adapter-interfaces.
const FILTER_TYPES: readonly string[] = [
  LogTypes.SUCCESS_LOGIN,
  LogTypes.FAILED_LOGIN,
  LogTypes.SUCCESS_SIGNUP,
  LogTypes.FAILED_SIGNUP,
  LogTypes.SUCCESS_LOGOUT,
  LogTypes.SUCCESS_SILENT_AUTH,
  LogTypes.FAILED_SILENT_AUTH,
  LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
  LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
  LogTypes.SUCCESS_API_OPERATION,
  LogTypes.FAILED_API_OPERATION,
  LogTypes.CODE_LINK_SENT,
  LogTypes.SUCCESS_CHANGE_EMAIL,
  LogTypes.FAILED_CHANGE_EMAIL,
  LogTypes.SUCCESS_CHANGE_PASSWORD,
  LogTypes.FAILED_CHANGE_PASSWORD,
  LogTypes.SUCCESS_HOOK,
  LogTypes.FAILED_HOOK,
];

const typeChoices = FILTER_TYPES.map((id) => ({
  id,
  name: getLogTypeDescription(id),
}));

const statusChoices = [
  { id: "true", name: "Success" },
  { id: "false", name: "Failed" },
];

export const logFilters = [
  <TextInput
    key="description"
    source="description"
    label="Description"
    placeholder="Contains…"
  />,
  <TextInput key="ip" source="ip" placeholder="IP" label="IP" />,
  <SelectInput key="type" source="type" choices={typeChoices} />,
  <SelectInput key="success" source="success" choices={statusChoices} />,
  <TextInput key="user_id" source="user_id" label="User ID" />,
  <TextInput key="user_name" source="user_name" label="User" />,
  <TextInput key="client_id" source="client_id" label="Client ID" />,
  <TextInput key="client_name" source="client_name" label="Client" />,
  <TextInput key="connection" source="connection" label="Connection" />,
  <TextInput
    key="connection_id"
    source="connection_id"
    label="Connection ID"
  />,
  <TextInput key="audience" source="audience" label="Audience" />,
  <TextInput key="scope" source="scope" label="Scope" />,
  <TextInput key="strategy" source="strategy" label="Strategy" />,
  <TextInput
    key="strategy_type"
    source="strategy_type"
    label="Strategy type"
  />,
  <TextInput key="hostname" source="hostname" label="Hostname" />,
  <TextInput
    key="country_code"
    source="country_code"
    label="Country"
    placeholder="e.g. SE"
  />,
];

export const logFiltersWithSearch = [
  <TextInput key="q" source="q" placeholder="Search" label="Search" alwaysOn />,
  ...logFilters,
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

function CountryCell() {
  const record = useRecordContext<{
    location_info?: { country_code?: string };
  }>();
  return record?.location_info?.country_code ?? null;
}

function IsMobileCell() {
  const record = useRecordContext<{ isMobile?: boolean }>();
  if (!record) return null;
  return record.isMobile ? "Yes" : "No";
}

// Columns hidden by default; users opt in via the Columns selector.
const DEFAULT_HIDDEN_COLUMNS = [
  "ip",
  "user_id",
  "client_name",
  "client_id",
  "connection",
  "connection_id",
  "audience",
  "scope",
  "strategy",
  "strategy_type",
  "hostname",
  "country_code",
  "isMobile",
  "user_agent",
  "log_id",
];

export interface LogsTableProps {
  bulkActionButtons?: ReactNode | false;
  storeKey?: string;
}

export function LogsTable({ bulkActionButtons, storeKey }: LogsTableProps) {
  return (
    <DataTable
      rowClick="show"
      hiddenColumns={DEFAULT_HIDDEN_COLUMNS}
      bulkActionButtons={bulkActionButtons}
      storeKey={storeKey}
    >
      <DataTable.Col label="">
        <LogIconCell />
      </DataTable.Col>
      <DataTable.Col source="type" label="Type" disableSort>
        <LogTypeCell />
      </DataTable.Col>
      <DataTable.Col source="date" label="When">
        <LogDateCell />
      </DataTable.Col>
      <DataTable.Col source="description" />
      <DataTable.Col source="ip" label="IP" />
      <DataTable.Col source="user_name" label="User" />
      <DataTable.Col source="user_id" label="User ID" />
      <DataTable.Col source="client_name" label="Client" />
      <DataTable.Col source="client_id" label="Client ID" />
      <DataTable.Col source="connection" label="Connection" />
      <DataTable.Col source="connection_id" label="Connection ID" />
      <DataTable.Col source="audience" label="Audience" />
      <DataTable.Col source="scope" label="Scope" />
      <DataTable.Col source="strategy" label="Strategy" />
      <DataTable.Col source="strategy_type" label="Strategy type" />
      <DataTable.Col source="hostname" label="Hostname" />
      <DataTable.Col source="country_code" label="Country">
        <CountryCell />
      </DataTable.Col>
      <DataTable.Col source="isMobile" label="Mobile">
        <IsMobileCell />
      </DataTable.Col>
      <DataTable.Col source="user_agent" label="User agent" />
      <DataTable.Col source="log_id" label="Log ID" />
    </DataTable>
  );
}
