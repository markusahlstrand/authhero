import type { ReactNode } from "react";
import { useRecordContext } from "ra-core";
import { Show } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ActionExecutionLogEntry,
  ActionExecutionResult,
  ActionExecutionStatus,
} from "@authhero/adapter-interfaces";

interface ExecutionRecord {
  id?: string;
  trigger_id?: string;
  status?: ActionExecutionStatus;
  results?: ActionExecutionResult[];
  created_at?: string;
  updated_at?: string;
  execution_logs?: Array<{
    action_name: string;
    lines: ActionExecutionLogEntry[];
  }>;
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

function statusVariant(
  status?: ActionExecutionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "final":
      return "default";
    case "partial":
      return "secondary";
    case "canceled":
      return "destructive";
    default:
      return "outline";
  }
}

function durationMs(started_at: string, ended_at: string): number | null {
  const start = Date.parse(started_at);
  const end = Date.parse(ended_at);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

function ExecutionDetails() {
  const record = useRecordContext<ExecutionRecord>();
  if (!record) return null;

  const logsByAction = new Map(
    (record.execution_logs ?? []).map((entry) => [entry.action_name, entry.lines]),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Execution</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="ID">
            <span className="font-mono text-xs">{record.id}</span>
          </Row>
          <Row label="Trigger">
            <PlainOrDash value={record.trigger_id} />
          </Row>
          <Row label="Status">
            {record.status ? (
              <Badge variant={statusVariant(record.status)}>{record.status}</Badge>
            ) : (
              <PlainOrDash />
            )}
          </Row>
          <Row label="Created at">
            <PlainOrDash
              value={
                record.created_at
                  ? new Date(record.created_at).toLocaleString()
                  : undefined
              }
            />
          </Row>
          <Row label="Updated at">
            <PlainOrDash
              value={
                record.updated_at
                  ? new Date(record.updated_at).toLocaleString()
                  : undefined
              }
            />
          </Row>
        </CardContent>
      </Card>

      {(record.results ?? []).map((result, idx) => {
        const duration = durationMs(result.started_at, result.ended_at);
        const lines = logsByAction.get(result.action_name) ?? [];
        return (
          <Card key={`${result.action_name}-${idx}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{result.action_name}</span>
                {result.error ? (
                  <Badge variant="destructive">error</Badge>
                ) : (
                  <Badge variant="default">success</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col">
              <Row label="Started at">
                <PlainOrDash
                  value={new Date(result.started_at).toLocaleString()}
                />
              </Row>
              <Row label="Ended at">
                <PlainOrDash
                  value={new Date(result.ended_at).toLocaleString()}
                />
              </Row>
              <Row label="Duration">
                <PlainOrDash
                  value={duration !== null ? `${duration} ms` : undefined}
                />
              </Row>
              {result.error && (
                <>
                  <Row label="Error code">
                    <span className="font-mono text-xs">{result.error.id}</span>
                  </Row>
                  <Row label="Error message">{result.error.msg}</Row>
                </>
              )}
              {lines.length > 0 && (
                <Row label="Console output">
                  <pre className="font-mono text-xs whitespace-pre-wrap bg-muted p-2 rounded">
                    {lines
                      .map((line) => `[${line.level}] ${line.message}`)
                      .join("\n")}
                  </pre>
                </Row>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ActionExecutionShow() {
  return (
    <Show>
      <ExecutionDetails />
    </Show>
  );
}
