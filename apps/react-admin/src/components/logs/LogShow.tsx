import { Show, FunctionField, SimpleShowLayout, TextField } from "react-admin";
import { LogType, LogIcon } from "../logs";
import { DateAgo } from "../common";
import { JsonOutput } from "../common/JsonOutput";

export function LogShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="id" />
        <TextField source="tenant_id" />
        <TextField source="user_id" />
        <TextField source="user_name" />
        <TextField source="ip" />
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
          render={(record: any) => <DateAgo date={record.date} />}
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
