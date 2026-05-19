import { useEffect, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useParams } from "react-router-dom";
import { Plus, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

interface RoleRecord {
  id: string;
  name?: string;
  description?: string;
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
  const [search, setSearch] = useState("");

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
      const filtered = all.data
        .filter((o) => !userOrgIds.has(o.id))
        .sort((a, b) =>
          (a.display_name || a.name || a.id).localeCompare(
            b.display_name || b.name || b.id,
          ),
        );
      setAvailable(filtered);
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
    setSearch("");
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
      <Button type="button" onClick={handleOpen}>
        <Plus className="h-4 w-4 mr-1" />
        Add to organization
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add to organizations</DialogTitle>
          </DialogHeader>
          {available.length > 5 && (
            <Input
              placeholder="Search organizations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="max-h-72 overflow-auto border rounded-md">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : available.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No organizations available
              </p>
            ) : (
              (() => {
                const q = search.trim().toLowerCase();
                const filtered = q
                  ? available.filter((o) =>
                      [o.display_name, o.name, o.id]
                        .filter((v): v is string => Boolean(v))
                        .some((v) => v.toLowerCase().includes(q)),
                    )
                  : available;
                if (filtered.length === 0) {
                  return (
                    <p className="p-4 text-sm text-muted-foreground">
                      No matches
                    </p>
                  );
                }
                return (
                  <ul className="divide-y">
                    {filtered.map((o) => (
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
                );
              })()
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

function ManageRolesCell() {
  const record = useRecordContext<OrganizationRecord>();
  const { id: userId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [assigned, setAssigned] = useState<RoleRecord[]>([]);
  const [allRoles, setAllRoles] = useState<RoleRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const orgId = record?.id;
  const orgLabel = record?.display_name || record?.name || record?.id || "";

  const load = async () => {
    if (!userId || !orgId) return;
    setLoading(true);
    try {
      const [allRes, assignedRes] = await Promise.all([
        dataProvider.getList<RoleRecord>(`organizations/${orgId}/roles`, {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        }),
        dataProvider.getList<RoleRecord>(
          `organizations/${orgId}/members/${userId}/roles`,
          {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          },
        ),
      ]);
      setAllRoles(allRes.data);
      setAssigned(assignedRes.data);
    } catch {
      notify("Error loading roles", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId, userId]);

  if (!record || !userId) return null;

  const assignedIds = new Set(assigned.map((r) => r.id));
  const available = allRoles.filter((r) => !assignedIds.has(r.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0 || !orgId) return;
    try {
      await dataProvider.create(
        `organizations/${orgId}/members/${userId}/roles`,
        { data: { roles: Array.from(selected) } },
      );
      notify(`${selected.size} role(s) added to ${orgLabel}`, {
        type: "success",
      });
      setSelected(new Set());
      load();
    } catch {
      notify("Error adding roles", { type: "error" });
    }
  };

  const handleRemove = async (role: RoleRecord) => {
    if (!orgId) return;
    try {
      await dataProvider.delete(
        `organizations/${orgId}/members/${userId}/roles`,
        { id: role.id, previousData: { id: role.id, roles: [role.id] } },
      );
      notify("Role removed", { type: "success" });
      load();
    } catch {
      notify("Error removing role", { type: "error" });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Manage roles"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Shield className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Manage roles in {orgLabel}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Assigned roles</h4>
              <div className="max-h-40 overflow-auto border rounded-md">
                {loading ? (
                  <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                ) : assigned.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No roles assigned in this organization
                  </p>
                ) : (
                  <ul className="divide-y">
                    {assigned.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 p-2"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {r.name || r.id}
                          </div>
                          {r.description && (
                            <div className="text-xs text-muted-foreground">
                              {r.description}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove role"
                          onClick={() => handleRemove(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Add roles</h4>
              <div className="max-h-48 overflow-auto border rounded-md">
                {loading ? (
                  <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                ) : available.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No more roles available in this organization
                  </p>
                ) : (
                  <ul className="divide-y">
                    {available.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start gap-2 p-2"
                      >
                        <Checkbox
                          id={`orgrole-${orgId}-${r.id}`}
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                        />
                        <label
                          htmlFor={`orgrole-${orgId}-${r.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="text-sm font-medium">
                            {r.name || r.id}
                          </div>
                          {r.description && (
                            <div className="text-xs text-muted-foreground">
                              {r.description}
                            </div>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `${selected.size} ` : ""}role(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RemoveOrganizationCell() {
  const record = useRecordContext<OrganizationRecord>();
  const { id: userId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!record || !userId) return null;

  const orgLabel = record.display_name || record.name || record.id;

  const handleRemove = async () => {
    setBusy(true);
    try {
      await dataProvider.delete("user-organizations", {
        id: record.id,
        previousData: { user_id: userId, organization_id: record.id },
      });
      notify(`Removed user from ${orgLabel}`, { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error removing user from organization", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove from organization"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Remove from {orgLabel}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The user will lose access to this organization and any roles
            assigned within it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={busy}
            >
              Remove
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
          <DataTable.Col label="">
            <div className="flex items-center justify-end gap-1">
              <ManageRolesCell />
              <RemoveOrganizationCell />
            </div>
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
