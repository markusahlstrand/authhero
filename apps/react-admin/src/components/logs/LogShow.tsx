import {
  Show,
  FunctionField,
  SimpleShowLayout,
  TextField,
  ReferenceField,
  useRecordContext,
} from "react-admin";
import { LogType, LogIcon } from "../logs";
import { JsonOutput } from "../common/JsonOutput";
import { Link } from "react-admin";

const UserIdField = () => {
  const record = useRecordContext();

  if (!record?.user_id) return <>-</>;

  return <Link to={`/users/${record.user_id}`}>{record.user_id}</Link>;
};

const IpAddressField = () => {
  const record = useRecordContext();

  if (!record?.ip) return <>-</>;

  return (
    <Link
      to={`/logs?displayedFilters=%7B%22ip%22%3Atrue%7D&filter=%7B%22ip%22%3A%22${encodeURIComponent(record.ip)}%22%7D`}
    >
      {record.ip}
    </Link>
  );
};

export function LogShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" />
        <TextField source="tenant_id" />
        <FunctionField label="User ID" render={() => <UserIdField />} />
        <TextField source="user_name" />
        <FunctionField label="IP Address" render={() => <IpAddressField />} />
        <TextField source="description" />
        <TextField source="client_id" />
        <TextField source="client_name" />
        <TextField source="user_agent" />
        <TextField source="log_id" />
        <FunctionField
          source="details"
          render={(record: any) => <JsonOutput data={record.details} />}
        />
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
          render={(record: any) => (
            <span>
              {record.date ? new Date(record.date).toLocaleString() : "-"}
            </span>
          )}
        />
        <TextField source="auth0_client" />
        <TextField source="isMobile" />
        <TextField source="connection" />
        <TextField source="connection_id" />
        <TextField source="audience" />
        <TextField source="scope" />
        <TextField source="strategy" />
        <TextField source="strategy_type" />
        <TextField source="hostname" />
        <TextField source="session_connection" />
      </SimpleShowLayout>
    </Show>
  );
}
