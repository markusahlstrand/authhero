import { useEffect, useState } from "react";
import type { RaRecord } from "ra-core";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  ListPagination,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import { DateAgo } from "@/common/DateAgo";

interface ResourceServer extends RaRecord {
  identifier: string;
  name?: string;
  scopes?: Array<{
    value?: string;
    permission_name?: string;
    description?: string;
  }>;
}

interface PermissionRecord extends RaRecord {
  permission_name: string;
  resource_server_identifier: string;
  resource_server_name?: string;
  description?: string;
  created_at?: string;
}

function AddPermissionButton() {
  const { id: userId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [resourceServers, setResourceServers] = useState<ResourceServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [available, setAvailable] = useState<
    Array<{ permission_name: string; description: string }>
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const selectedServer = resourceServers.find(
    (s) => s.identifier === selectedServerId,
  );

  const reset = () => {
    setSelectedServerId("");
    setAvailable([]);
    setSelected(new Set());
  };

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const { data } = await dataProvider.getList<ResourceServer>(
        "resource-servers",
        {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      setResourceServers(data);
    } catch {
      notify("Error loading resource servers", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  useEffect(() => {
    if (!selectedServerId || !userId) return;
    const server = resourceServers.find(
      (s) => s.identifier === selectedServerId,
    );
    if (!server) return;
    setSelected(new Set());
    setLoading(true);
    (async () => {
      try {
        const allScopes = (server.scopes ?? []).map((s) => ({
          permission_name: s.permission_name ?? s.value ?? "",
          description: s.description ?? "",
        }));
        const existing = await dataProvider.getList<PermissionRecord>(
          `users/${userId}/permissions`,
          {
            pagination: { page: 1, perPage: 200 },
            sort: { field: "permission_name", order: "ASC" },
            filter: {},
          },
        );
        const existingNames = new Set(
          existing.data
            .filter((p) => p.resource_server_identifier === server.identifier)
            .map((p) => p.permission_name),
        );
        setAvailable(
          allScopes.filter(
            (s) => s.permission_name && !existingNames.has(s.permission_name),
          ),
        );
      } catch {
        notify("Error loading permissions", { type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedServerId, userId, resourceServers, dataProvider, notify]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!userId || !selectedServer || selected.size === 0) return;
    try {
      await dataProvider.create(`users/${userId}/permissions`, {
        data: {
          permissions: Array.from(selected).map((permission_name) => ({
            permission_name,
            resource_server_identifier: selectedServer.identifier,
          })),
        },
      });
      notify(`${selected.size} permission(s) added`, { type: "success" });
      handleClose();
      refresh();
    } catch {
      notify("Error adding permissions", { type: "error" });
    }
  };

  if (!userId) return null;

  return (
    <>
      <Button onClick={handleOpen}>
        <Plus className="h-4 w-4 mr-1" />
        Add permission
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add permissions</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Select
                value={selectedServerId}
                onValueChange={setSelectedServerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a resource server" />
                </SelectTrigger>
                <SelectContent>
                  {resourceServers.map((s) => (
                    <SelectItem
                      key={s.identifier}
                      value={s.identifier}
                    >
                      {s.name || s.identifier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedServerId && (
              <div className="max-h-72 overflow-auto border rounded-md">
                {loading ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : available.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    This user already has all available scopes.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {available.map((p) => (
                      <li key={p.permission_name} className="flex items-start gap-2 p-2">
                        <Checkbox
                          id={`perm-${p.permission_name}`}
                          checked={selected.has(p.permission_name)}
                          onCheckedChange={() => toggle(p.permission_name)}
                        />
                        <label
                          htmlFor={`perm-${p.permission_name}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="text-sm font-medium">
                            {p.permission_name}
                          </div>
                          {p.description && (
                            <div className="text-xs text-muted-foreground">
                              {p.description}
                            </div>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `${selected.size} ` : ""}permission(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RemovePermissionCell() {
  const record = useRecordContext<PermissionRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const { id: userId } = useParams();
  const [open, setOpen] = useState(false);

  if (!record) return null;

  const handleRemove = async () => {
    if (!userId) return;
    try {
      const id = encodeURIComponent(
        `${record.resource_server_identifier}:${record.permission_name}`,
      );
      await dataProvider.delete(`users/${userId}/permissions`, {
        id,
        previousData: record,
      });
      notify("Permission removed", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error removing permission", { type: "error" });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove permission"
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
            <DialogTitle>Remove permission</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove permission "{record.permission_name}" from "
            {record.resource_server_name ?? record.resource_server_identifier}"?
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssignedCell() {
  const record = useRecordContext<PermissionRecord>();
  if (!record?.created_at) return <>-</>;
  return <DateAgo date={record.created_at} />;
}

export function PermissionsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <AddPermissionButton />
      </div>
      <ReferenceManyField
        reference="permissions"
        target="user_id"
        sort={{ field: "permission_name", order: "ASC" }}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            No permissions assigned
          </p>
        }
      >
        <DataTable rowClick={false} bulkActionButtons={false}>
          <DataTable.Col
            source="resource_server_identifier"
            label="Resource server"
          />
          <DataTable.Col
            source="resource_server_name"
            label="Resource name"
          />
          <DataTable.Col source="permission_name" label="Permission" />
          <DataTable.Col label="Description">
            <TextField source="description" />
          </DataTable.Col>
          <DataTable.Col label="Assigned">
            <AssignedCell />
          </DataTable.Col>
          <DataTable.Col label="">
            <RemovePermissionCell />
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
