import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  ListPagination,
  ReferenceManyField,
} from "@/components/admin";
import { DateAgo } from "@/common/DateAgo";

interface OrganizationRecord {
  id: string;
  name?: string;
  display_name?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

function AddOrganizationButton() {
  const { id: userId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<OrganizationRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    if (!userId) return;
    setLoading(true);
    try {
      const all = await dataProvider.getList<OrganizationRecord>(
        "organizations",
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      const userOrgs = await dataProvider.getList<OrganizationRecord>(
        "user-organizations",
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: { user_id: userId },
        },
      );
      const userOrgIds = new Set(userOrgs.data.map((o) => o.id));
      setAvailable(all.data.filter((o) => !userOrgIds.has(o.id)));
    } catch {
      notify("Error loading organizations", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelected(new Set());
    setAvailable([]);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!userId || selected.size === 0) return;
    try {
      for (const orgId of selected) {
        await dataProvider.create("organization-members", {
          data: { organization_id: orgId, user_ids: [userId] },
        });
      }
      notify(`Added user to ${selected.size} organization(s)`, {
        type: "success",
      });
      handleClose();
      refresh();
    } catch {
      notify("Error adding user to organizations", { type: "error" });
    }
  };

  if (!userId) return null;

  return (
    <>
      <Button onClick={handleOpen}>
        <Plus className="h-4 w-4 mr-1" />
        Add to organization
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add to organizations</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-auto border rounded-md">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : available.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No organizations available
              </p>
            ) : (
              <ul className="divide-y">
                {available.map((o) => (
                  <li key={o.id} className="flex items-start gap-2 p-2">
                    <Checkbox
                      id={`org-${o.id}`}
                      checked={selected.has(o.id)}
                      onCheckedChange={() => toggle(o.id)}
                    />
                    <label
                      htmlFor={`org-${o.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="text-sm font-medium">
                        {o.display_name || o.name || o.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: {o.id}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              Add to {selected.size > 0 ? `${selected.size} ` : ""}organization(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetadataCell() {
  const record = useRecordContext<OrganizationRecord>();
  const count = record?.metadata ? Object.keys(record.metadata).length : 0;
  return <>{count > 0 ? `${count} properties` : "-"}</>;
}

function JoinedCell() {
  const record = useRecordContext<OrganizationRecord>();
  if (!record?.created_at) return <>-</>;
  return <DateAgo date={record.created_at} />;
}

export function OrganizationsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <AddOrganizationButton />
      </div>
      <ReferenceManyField
        reference="user-organizations"
        target="user_id"
        sort={{ field: "name", order: "ASC" }}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            User is not in any organization
          </p>
        }
      >
        <DataTable
          rowClick={(_, __, record) => `/organizations/${record.id}`}
          bulkActionButtons={false}
        >
          <DataTable.Col source="name" label="Organization name" />
          <DataTable.Col source="display_name" label="Display name" />
          <DataTable.Col source="id" label="Organization ID" />
          <DataTable.Col label="Metadata">
            <MetadataCell />
          </DataTable.Col>
          <DataTable.Col label="Joined">
            <JoinedCell />
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
