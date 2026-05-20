import {
  ColumnsButton,
  FilterButton,
  FilterForm,
  ListPagination,
  ReferenceManyField,
} from "@/components/admin";
import { LogsTable, logFiltersWithSearch } from "../../logs/LogsTable";

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
      <div className="flex flex-row items-end gap-2 mb-2 flex-wrap">
        <FilterForm filters={logFiltersWithSearch} />
        <FilterButton filters={logFiltersWithSearch} resource="logs" />
        <ColumnsButton />
      </div>
      <LogsTable bulkActionButtons={false} />
    </ReferenceManyField>
  );
}
