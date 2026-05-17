import {
  DataTable,
  ListPagination,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { LogIcon } from "../../logs/LogIcon";
import { LogType } from "../../logs/LogType";
import { DateAgo } from "@/common/DateAgo";

interface LogRecord {
  id: string;
  type: string;
  date?: string;
  description?: string;
}

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
