import { List } from "@/components/admin";
import { LogsTable, logFilters } from "./LogsTable";

export function LogsList() {
  return (
    <List filters={logFilters} sort={{ field: "date", order: "DESC" }}>
      <LogsTable />
    </List>
  );
}
