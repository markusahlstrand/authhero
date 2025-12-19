import {
  List,
  Datagrid,
  TextField,
  TextInput,
  FunctionField,
  TopToolbar,
  ExportButton,
} from "react-admin";
import { LogType, LogIcon } from "../logs";
import { DateAgo } from "../common";

const LogListActions = () => (
  <TopToolbar>
    <ExportButton />
  </TopToolbar>
);

export function LogsList() {
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
    <TextInput key="ip" label="IP Address" source="ip" />,
  ];

  return (
    <List
      actions={<LogListActions />}
      filters={postFilters}
      sort={{ field: "date", order: "DESC" }}
    >
      <Datagrid bulkActionButtons={false} rowClick="show">
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
    </List>
  );
}
