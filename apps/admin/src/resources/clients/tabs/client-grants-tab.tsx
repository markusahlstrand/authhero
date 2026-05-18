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
import { Badge } from "@/components/ui/badge";
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

interface ClientGrantRecord extends RaRecord {
  audience: string;
  scope?: string[];
  client_id?: string;
  created_at?: string;
}

function useClientId(): string | undefined {
  const { id } = useParams();
  const record = useRecordContext<{ id?: string }>();
  return (record?.id as string | undefined) ?? id;
}

function AddClientGrantButton() {
  const clientId = useClientId();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [resourceServers, setResourceServers] = useState<ResourceServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [available, setAvailable] = useState<
    Array<{ value: string; description: string }>
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
    if (!selectedServerId || !clientId) return;
    const server = resourceServers.find(
      (s) => s.identifier === selectedServerId,
    );
    if (!server) return;
    setSelected(new Set());
    setLoading(true);
    (async () => {
      try {
        const allScopes = (server.scopes ?? []).map((s) => ({
          value: s.value ?? s.permission_name ?? "",
          description: s.description ?? "",
        }));
        const existing = await dataProvider.getList<ClientGrantRecord>(
          "client-grants",
          {
            pagination: { page: 1, perPage: 200 },
            sort: { field: "audience", order: "ASC" },
            filter: { client_id: clientId },
          },
        );
        const existingGrant = existing.data.find(
          (g) => g.audience === server.identifier,
        );
        const existingScopes = new Set(existingGrant?.scope ?? []);
        setAvailable(
          allScopes.filter((s) => s.value && !existingScopes.has(s.value)),
        );
      } catch {
        notify("Error loading scopes", { type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedServerId, clientId, resourceServers, dataProvider, notify]);

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!clientId || !selectedServer || selected.size === 0) return;
    try {
      const newScopes = Array.from(selected);
      const existing = await dataProvider.getList<ClientGrantRecord>(
        "client-grants",
        {
          pagination: { page: 1, perPage: 200 },
          sort: { field: "audience", order: "ASC" },
          filter: { client_id: clientId },
        },
      );
      const existingGrant = existing.data.find(
        (g) => g.audience === selectedServer.identifier,
      );
      if (existingGrant) {
        const merged = Array.from(
          new Set([...(existingGrant.scope ?? []), ...newScopes]),
        );
        await dataProvider.update("client-grants", {
          id: existingGrant.id,
          data: { scope: merged },
          previousData: existingGrant,
        });
        notify(
          `Client grant updated with ${newScopes.length} additional scope(s)`,
          { type: "success" },
        );
      } else {
        await dataProvider.create("client-grants", {
          data: {
            client_id: clientId,
            audience: selectedServer.identifier,
            scope: newScopes,
          },
        });
        notify(`Client grant created with ${newScopes.length} scope(s)`, {
          type: "success",
        });
      }
      handleClose();
      refresh();
    } catch {
      notify("Error creating/updating client grant", { type: "error" });
    }
  };

  if (!clientId) return null;

  return (
    <>
      <Button type="button" onClick={handleOpen}>
        <Plus className="h-4 w-4 mr-1" />
        Add client grant
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add client grant</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Select a resource server and scopes to grant access to this
              client.
            </p>
            <Select
              value={selectedServerId}
              onValueChange={setSelectedServerId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a resource server" />
              </SelectTrigger>
              <SelectContent>
                {resourceServers.map((s) => (
                  <SelectItem key={s.identifier} value={s.identifier}>
                    {s.name || s.identifier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServerId && (
              <div className="max-h-72 overflow-auto border rounded-md">
                {loading ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading…</p>
                ) : available.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    This client already has access to all available scopes for
                    the selected resource server.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {available.map((s) => (
                      <li
                        key={s.value}
                        className="flex items-start gap-2 p-2"
                      >
                        <Checkbox
                          id={`scope-${s.value}`}
                          checked={selected.has(s.value)}
                          onCheckedChange={() => toggle(s.value)}
                        />
                        <label
                          htmlFor={`scope-${s.value}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="text-sm font-medium">{s.value}</div>
                          {s.description && (
                            <div className="text-xs text-muted-foreground">
                              {s.description}
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
            <Button
              onClick={handleAdd}
              disabled={!selectedServer || selected.size === 0}
            >
              Add {selected.size > 0 ? `${selected.size} ` : ""}scope(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScopesCell() {
  const record = useRecordContext<ClientGrantRecord>();
  if (!record?.scope || record.scope.length === 0) {
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

function CreatedCell() {
  const record = useRecordContext<ClientGrantRecord>();
  if (!record?.created_at) return <>-</>;
  return <DateAgo date={record.created_at} />;
}

function RemoveClientGrantCell() {
  const record = useRecordContext<ClientGrantRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);

  if (!record) return null;

  const handleRemove = async () => {
    try {
      await dataProvider.delete("client-grants", {
        id: record.id,
        previousData: record,
      });
      notify("Client grant removed", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error removing client grant", { type: "error" });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove client grant"
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
            <DialogTitle>Remove client grant</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove this client grant for <strong>{record.audience}</strong>?
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

export function ClientGrantsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <AddClientGrantButton />
      </div>
      <ReferenceManyField
        reference="client-grants"
        target="client_id"
        sort={{ field: "audience", order: "ASC" }}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            No client grants configured
          </p>
        }
      >
        <DataTable rowClick={false} bulkActionButtons={false}>
          <DataTable.Col source="audience" label="Resource server" />
          <DataTable.Col label="Scopes">
            <ScopesCell />
          </DataTable.Col>
          <DataTable.Col label="Created">
            <CreatedCell />
          </DataTable.Col>
          <DataTable.Col label="">
            <RemoveClientGrantCell />
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
