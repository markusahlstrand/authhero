import {
  List,
  Datagrid,
  TextField,
  TextInput,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";
import { LogType, LogIcon } from "../logs";
import { DateAgo } from "../common";

export function LogsList() {
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
  ];

  return (
    <List
      actions={<PostListActions create="false" />}
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
