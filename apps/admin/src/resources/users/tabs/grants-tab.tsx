import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Confirm } from "@/components/admin/confirm";
import {
  DataTable,
  ListPagination,
  ReferenceField,
  ReferenceManyField,
  TextField,
} from "@/components/admin";

interface GrantRecord {
  id: string;
  clientID: string;
  audience?: string;
  scope?: string[];
}

function ClientCell() {
  const record = useRecordContext<GrantRecord>();
  if (!record?.clientID) return <>-</>;
  return (
    <ReferenceField
      source="clientID"
      reference="clients"
      link="edit"
      empty={record.clientID}
    >
      <TextField source="name" />
    </ReferenceField>
  );
}

function AudienceCell() {
  const record = useRecordContext<GrantRecord>();
  if (!record?.audience) return <>-</>;
  return <>{record.audience}</>;
}

function ScopeCell() {
  const record = useRecordContext<GrantRecord>();
  if (!record?.scope?.length) {
    return <span className="text-muted-foreground">No scopes</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {record.scope.map((s) => (
        <Badge key={s} variant="secondary">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function RevokeGrantCell() {
  const record = useRecordContext<GrantRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!record) return null;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await dataProvider.delete("grants", {
        id: record.id,
        previousData: record,
      });
      notify("Grant revoked", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error revoking grant", { type: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Revoke grant"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Confirm
        isOpen={open}
        title="Revoke this grant?"
        content={`The user will need to re-consent before ${
          record.audience || "this application"
        } can access their data again.`}
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
        loading={pending}
      />
    </>
  );
}

export function GrantsTab() {
  return (
    <ReferenceManyField
      reference="grants"
      target="user_id"
      perPage={10}
      pagination={<ListPagination />}
      empty={
        <p className="text-sm text-muted-foreground py-4">No OAuth grants</p>
      }
    >
      <DataTable rowClick={false} bulkActionButtons={false}>
        <DataTable.Col label="Application">
          <ClientCell />
        </DataTable.Col>
        <DataTable.Col label="Audience">
          <AudienceCell />
        </DataTable.Col>
        <DataTable.Col label="Granted scope">
          <ScopeCell />
        </DataTable.Col>
        <DataTable.Col label="">
          <div className="flex justify-end">
            <RevokeGrantCell />
          </div>
        </DataTable.Col>
      </DataTable>
    </ReferenceManyField>
  );
}
