import {
  List,
  Datagrid,
  TextField,
  TextInput,
  SelectInput,
  FunctionField,
} from "react-admin";
import { PostListActions } from "../listActions/PostListActions";
import { LogType, LogIcon } from "../logs";
import { LogTypes } from "../../lib/logs";
import { DateAgo } from "../common";

const typeChoices = [
  { id: LogTypes.SUCCESS_LOGIN, name: "Success Login" },
  { id: LogTypes.FAILED_LOGIN, name: "Failed Login" },
  { id: LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD, name: "Failed Login - Incorrect Password" },
  { id: LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME, name: "Failed Login - Invalid Email/Username" },
  { id: LogTypes.SUCCESS_SIGNUP, name: "Success Signup" },
  { id: LogTypes.FAILED_SIGNUP, name: "Failed Signup" },
  { id: LogTypes.SUCCESS_LOGOUT, name: "Success Logout" },
  { id: LogTypes.SUCCESS_SILENT_AUTH, name: "Success Silent Auth" },
  { id: LogTypes.FAILED_SILENT_AUTH, name: "Failed Silent Auth" },
  { id: LogTypes.SUCCESS_CROSS_ORIGIN_AUTHENTICATION, name: "Success Cross Origin Auth" },
  { id: LogTypes.FAILED_CROSS_ORIGIN_AUTHENTICATION, name: "Failed Cross Origin Auth" },
  { id: LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN, name: "Success Code Exchange" },
  { id: LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN, name: "Failed Code Exchange" },
  { id: LogTypes.SUCCESS_API_OPERATION, name: "Success API Operation" },
  { id: LogTypes.CODE_LINK_SENT, name: "Code/Link Sent" },
];

const statusChoices = [
  { id: "true", name: "Success" },
  { id: "false", name: "Failed" },
];

export function LogsList() {
  const postFilters = [
    <TextInput key="search" label="Search" source="q" alwaysOn />,
    <TextInput key="ip" label="IP Address" source="ip" />,
    <SelectInput key="type" label="Type" source="type" choices={typeChoices} />,
    <SelectInput key="success" label="Status" source="success" choices={statusChoices} />,
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
