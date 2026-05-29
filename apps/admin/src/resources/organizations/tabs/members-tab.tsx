import { useEffect, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DataTable,
  ListPagination,
  ReferenceManyField,
} from "@/components/admin";
import { getUserAvatarColor, getUserAvatarSeed } from "@/utils/userAvatar";

interface UserSummary {
  id: string | number;
  user_id?: string;
  email?: string;
  name?: string;
  picture?: string;
  connection?: string;
  phone_number?: string;
}

interface RoleSummary {
  id: string;
  name?: string;
  description?: string;
}

interface MemberRecord {
  id: string;
  organization_id: string;
  user_id: string;
  email?: string;
  name?: string;
  picture?: string;
  roles?: RoleSummary[];
}

function AddMemberButton() {
  const { id: organizationId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setSearch("");
    setResults([]);
    setSelected(new Set());
  };
  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data } = await dataProvider.getList<UserSummary>("users", {
        pagination: { page: 1, perPage: 25 },
        sort: { field: "email", order: "ASC" },
        filter: { q: search },
      });
      setResults(data);
    } catch {
      notify("Error searching for users", { type: "error" });
    } finally {
      setSearching(false);
    }
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
    if (!organizationId || selected.size === 0) return;
    try {
      await dataProvider.create("organization-members", {
        data: {
          organization_id: organizationId,
          user_ids: Array.from(selected),
        },
      });
      notify(`Added ${selected.size} member(s)`, { type: "success" });
      handleClose();
      refresh();
    } catch {
      notify("Error adding members", { type: "error" });
    }
  };

  if (!organizationId) return null;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add member
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Search by email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doSearch();
                }
              }}
            />
            <Button onClick={doSearch} disabled={searching || !search.trim()}>
              Search
            </Button>
          </div>
          <div className="max-h-72 overflow-auto border rounded-md">
            {searching ? (
              <p className="p-4 text-sm text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {search ? "No users found" : "Search for users to add"}
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((u) => {
                  const userId = String(u.user_id ?? u.id);
                  return (
                    <li key={userId} className="flex items-start gap-2 p-2">
                      <Checkbox
                        id={`member-${userId}`}
                        checked={selected.has(userId)}
                        onCheckedChange={() => toggle(userId)}
                      />
                      <label
                        htmlFor={`member-${userId}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-medium">
                          {u.email || u.phone_number || userId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID: {userId}
                          {u.connection ? ` · ${u.connection}` : ""}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `${selected.size} ` : ""}member(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemberAvatarCell() {
  const record = useRecordContext<MemberRecord>();
  if (!record) return null;
  const seed = getUserAvatarSeed({
    email: record.email,
    name: record.name,
    user_id: record.user_id,
  });
  const initial = seed.charAt(0).toUpperCase();
  const bg = getUserAvatarColor(seed);
  return (
    <Avatar>
      {record.picture ? (
        <AvatarImage src={record.picture} alt={record.email || record.name} />
      ) : null}
      <AvatarFallback style={{ backgroundColor: bg, color: "white" }}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

function RemoveMemberCell() {
  const record = useRecordContext<MemberRecord>();
  const { id: organizationId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!record || !organizationId) return null;

  const label = record.email || record.name || record.user_id;

  const handleRemove = async () => {
    setBusy(true);
    try {
      await dataProvider.delete("organization-members", {
        id: organizationId,
        previousData: {
          id: organizationId,
          organization_id: organizationId,
          user_id: record.user_id,
          user_ids: [record.user_id],
        },
      });
      notify(`Removed ${label}`, { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error removing member", { type: "error" });
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
        aria-label="Remove member"
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
            <DialogTitle>Remove {label}?</DialogTitle>
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

function MemberRolesCell() {
  const record = useRecordContext<MemberRecord>();
  if (!record) return null;
  const roles = record.roles ?? [];
  if (roles.length === 0) {
    return <span className="text-xs text-muted-foreground">No roles</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role.id} variant="secondary" title={role.description}>
          {role.name || role.id}
        </Badge>
      ))}
    </div>
  );
}

function EditMemberRolesCell() {
  const record = useRecordContext<MemberRecord>();
  const { id: organizationId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !organizationId) {
      setAllRoles([]);
      setSelected(new Set());
      setInitial(new Set());
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await dataProvider.getList<RoleSummary>(
          `organizations/${organizationId}/roles`,
          {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          },
        );
        setAllRoles(res.data);
        const current = new Set((record?.roles ?? []).map((r) => r.id));
        setSelected(new Set(current));
        setInitial(current);
      } catch {
        setAllRoles([]);
        setSelected(new Set());
        setInitial(new Set());
        notify("Error loading roles", { type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, organizationId, dataProvider, notify, record]);

  if (!record || !organizationId) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const toAdd = Array.from(selected).filter((id) => !initial.has(id));
      const toRemove = Array.from(initial).filter((id) => !selected.has(id));
      if (toAdd.length > 0) {
        await dataProvider.create(
          `organizations/${organizationId}/members/${record.user_id}/roles`,
          { data: { roles: toAdd } },
        );
      }
      for (const roleId of toRemove) {
        await dataProvider.delete(
          `organizations/${organizationId}/members/${record.user_id}/roles`,
          { id: roleId, previousData: { id: roleId, roles: [roleId] } },
        );
      }
      notify("Roles updated", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error updating roles", { type: "error" });
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
        aria-label="Edit roles"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              Edit roles for {record.email || record.name || record.user_id}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-auto border rounded-md">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : allRoles.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No roles defined in this tenant
              </p>
            ) : (
              <ul className="divide-y">
                {allRoles.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 p-2">
                    <Checkbox
                      id={`org-member-role-${r.id}`}
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                    />
                    <label
                      htmlFor={`org-member-role-${r.id}`}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy || loading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MembersTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <AddMemberButton />
      </div>
      <ReferenceManyField
        reference="organization-members"
        target="organization_id"
        sort={{ field: "email", order: "ASC" }}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            No members in this organization
          </p>
        }
      >
        <DataTable
          rowClick={(_, __, record) => `/users/${record.user_id}`}
          bulkActionButtons={false}
        >
          <DataTable.Col label="">
            <MemberAvatarCell />
          </DataTable.Col>
          <DataTable.Col source="email" />
          <DataTable.Col source="name" />
          <DataTable.Col source="user_id" label="User ID" />
          <DataTable.Col label="Roles">
            <MemberRolesCell />
          </DataTable.Col>
          <DataTable.Col label="">
            <div className="flex items-center justify-end gap-1">
              <EditMemberRolesCell />
              <RemoveMemberCell />
            </div>
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
