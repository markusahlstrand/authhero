import type { ReactNode } from "react";
import { useRecordContext, useCreatePath } from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReferenceField, TextField } from "@/components/admin";
import { LogIcon } from "../LogIcon";
import { LogType } from "../LogType";
import type { LogTypes } from "@/lib/logs";

interface LogRecord {
  id?: string;
  log_id?: string;
  type?: string;
  description?: string;
  date?: string;
  user_id?: string;
  user_name?: string;
  client_id?: string;
  client_name?: string;
  ip?: string;
  user_agent?: string;
  connection?: string;
  connection_id?: string;
  strategy?: string;
  strategy_type?: string;
  hostname?: string;
  audience?: string;
  scope?: string | string[];
  details?: {
    execution_id?: string;
    [key: string]: unknown;
  };
}

function FilterLink({
  field,
  value,
  children,
}: {
  field: string;
  value: string;
  children: ReactNode;
}) {
  const createPath = useCreatePath();
  return (
    <Link
      to={{
        pathname: createPath({ resource: "logs", type: "list" }),
        search: `filter=${encodeURIComponent(
          JSON.stringify({ [field]: value }),
        )}`,
      }}
      className="text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

function ActionExecutionLink({ executionId }: { executionId: string }) {
  const createPath = useCreatePath();
  return (
    <Link
      to={createPath({
        resource: "action-executions",
        type: "show",
        id: executionId,
      })}
      className="text-primary hover:underline font-mono text-xs"
    >
      {executionId}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-4 py-2 border-b last:border-b-0">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-sm break-all">{children}</div>
    </div>
  );
}

function PlainOrDash({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <>{value}</>;
}

export function DetailsTab() {
  const record = useRecordContext<LogRecord>();
  if (!record) return null;

  const scope = Array.isArray(record.scope)
    ? record.scope.join(" ")
    : record.scope;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {record.type && <LogIcon type={record.type} />}
            <span>
              {record.type ? <LogType type={record.type as LogTypes} /> : "Log"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="ID">
            <span className="font-mono text-xs">
              {record.log_id || record.id}
            </span>
          </Row>
          <Row label="Type">
            {record.type ? (
              <FilterLink field="type" value={record.type}>
                <LogType type={record.type as LogTypes} />
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Date">
            <PlainOrDash
              value={
                record.date ? new Date(record.date).toLocaleString() : undefined
              }
            />
          </Row>
          <Row label="Description">
            <PlainOrDash value={record.description} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="User">
            {record.user_id ? (
              <ReferenceField source="user_id" reference="users" link="edit">
                <TextField source="email" />
              </ReferenceField>
            ) : (
              <PlainOrDash value={record.user_name} />
            )}
          </Row>
          <Row label="User ID">
            {record.user_id ? (
              <FilterLink field="user_id" value={record.user_id}>
                <span className="font-mono text-xs">{record.user_id}</span>
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="User name">
            <PlainOrDash value={record.user_name} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="Client">
            {record.client_id ? (
              <ReferenceField
                source="client_id"
                reference="clients"
                link="edit"
              >
                <TextField source="name" />
              </ReferenceField>
            ) : (
              <PlainOrDash value={record.client_name} />
            )}
          </Row>
          <Row label="Client ID">
            {record.client_id ? (
              <FilterLink field="client_id" value={record.client_id}>
                <span className="font-mono text-xs">{record.client_id}</span>
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Audience">
            {record.audience ? (
              <FilterLink field="audience" value={record.audience}>
                {record.audience}
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Scope">
            <PlainOrDash value={scope} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="Connection">
            {record.connection ? (
              <FilterLink field="connection" value={record.connection}>
                {record.connection}
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Strategy">
            {record.strategy ? (
              <FilterLink field="strategy" value={record.strategy}>
                {record.strategy}
              </FilterLink>
            ) : (
              <PlainOrDash value={record.strategy_type} />
            )}
          </Row>
        </CardContent>
      </Card>

      {record.details?.execution_id && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            <Row label="Execution ID">
              <ActionExecutionLink executionId={record.details.execution_id} />
            </Row>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="IP">
            {record.ip ? (
              <FilterLink field="ip" value={record.ip}>
                <span className="font-mono text-xs">{record.ip}</span>
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Hostname">
            {record.hostname ? (
              <FilterLink field="hostname" value={record.hostname}>
                {record.hostname}
              </FilterLink>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="User agent">
            <PlainOrDash value={record.user_agent} />
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}
