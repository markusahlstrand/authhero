import { useState } from "react";
import { Link } from "react-router-dom";
import type { RaRecord } from "ra-core";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  FilterForm,
  ListPagination,
  ReferenceManyField,
  SearchInput,
} from "@/components/admin";

interface ScopeRecord extends RaRecord {
  resource_server_id: string;
  value: string;
  description?: string;
}

function RemoveScopeCell() {
  const record = useRecordContext<ScopeRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);

  if (!record) return null;

  const handleRemove = async () => {
    try {
      await dataProvider.delete("resource-server-scopes", {
        id: record.id,
        previousData: record,
      });
      notify("Scope removed", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error removing scope", { type: "error" });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove scope"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove scope</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove the scope <strong>{record.value}</strong>?
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ScopesTab() {
  const record = useRecordContext<{ id?: string; is_system?: boolean }>();
  const rsId = record?.id ? String(record.id) : undefined;
  const isSystem = !!record?.is_system;

  if (!rsId) return null;

  const editPath = (scope: ScopeRecord) =>
    `/resource-servers/${rsId}/scopes/${encodeURIComponent(scope.value)}/edit`;

  return (
    <div className="flex flex-col gap-4">
      {!isSystem && (
        <div>
          <Button asChild type="button">
            <Link to={`/resource-servers/${rsId}/scopes/create`}>
              <Plus className="h-4 w-4 mr-1" />
              Add scope
            </Link>
          </Button>
        </div>
      )}
      <ReferenceManyField
        reference="resource-server-scopes"
        target="resource_server_id"
        sort={{ field: "value", order: "ASC" }}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            No scopes defined
          </p>
        }
      >
        <FilterForm filters={[<SearchInput key="q" source="q" alwaysOn />]} />
        <DataTable
          rowClick={(_id, _r, scope) => editPath(scope as ScopeRecord)}
          bulkActionButtons={false}
        >
          <DataTable.Col source="value" label="Scope" />
          <DataTable.Col source="description" label="Description" />
          {!isSystem && (
            <DataTable.Col label="">
              <RemoveScopeCell />
            </DataTable.Col>
          )}
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
