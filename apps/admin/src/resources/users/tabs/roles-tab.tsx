import { useCallback, useEffect, useState } from "react";
import { useDataProvider, useNotify } from "ra-core";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RoleRecord {
  id: string;
  name?: string;
  description?: string;
}

interface OrganizationRecord {
  id: string;
  name?: string;
  display_name?: string;
}

type RoleContext = "global" | "organization";

interface UserRoleRow extends RoleRecord {
  organization_id: string | null;
  organization_name: string;
  role_context: RoleContext;
}

const GLOBAL_ID = "global";

function useUserRoles(userId: string | undefined) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const orgsRes = await dataProvider.getList<OrganizationRecord>(
        `users/${userId}/organizations`,
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      const orgs = orgsRes.data;

      const globalRes = await dataProvider.getList<RoleRecord>(
        `users/${userId}/roles`,
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      const global: UserRoleRow[] = globalRes.data.map((r) => ({
        ...r,
        organization_id: null,
        organization_name: "Global",
        role_context: "global",
      }));

      const orgRoles: UserRoleRow[] = [];
      for (const org of orgs) {
        try {
          const res = await dataProvider.getList<RoleRecord>(
            `organizations/${org.id}/members/${userId}/roles`,
            {
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "name", order: "ASC" },
              filter: {},
            },
          );
          for (const r of res.data) {
            orgRoles.push({
              ...r,
              organization_id: org.id,
              organization_name: org.display_name || org.name || org.id,
              role_context: "organization",
            });
          }
        } catch {
          // ignore single-org failures
        }
      }

      const map = new Map<string, UserRoleRow>();
      for (const r of [...global, ...orgRoles]) {
        map.set(`${r.id}-${r.organization_id ?? "global"}`, r);
      }
      setRows(Array.from(map.values()));
    } catch {
      notify("Error loading roles", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, notify, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, reload: load };
}

interface AddRoleDialogProps {
  userId: string;
  onAdded: () => void;
}

function AddRoleDialog({ userId, onAdded }: AddRoleDialogProps) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [userOrgs, setUserOrgs] = useState<OrganizationRecord[]>([]);
  const [orgId, setOrgId] = useState<string>(GLOBAL_ID);
  const [available, setAvailable] = useState<RoleRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const handleOpen = async () => {
    setOpen(true);
    setOrgId(GLOBAL_ID);
    setSelected(new Set());
    setSearch("");
    try {
      const res = await dataProvider.getList<OrganizationRecord>(
        `users/${userId}/organizations`,
        {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        },
      );
      setUserOrgs(res.data);
    } catch {
      // non-critical
    }
  };

  const handleClose = () => {
    setOpen(false);
    setOrgId(GLOBAL_ID);
    setSelected(new Set());
    setAvailable([]);
    setSearch("");
  };

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    (async () => {
      try {
        let allRoles: RoleRecord[] = [];
        let assigned: RoleRecord[] = [];
        if (orgId !== GLOBAL_ID) {
          const all = await dataProvider.getList<RoleRecord>(
            `organizations/${orgId}/roles`,
            {
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "name", order: "ASC" },
              filter: {},
            },
          );
          allRoles = all.data;
          const ass = await dataProvider.getList<RoleRecord>(
            `organizations/${orgId}/members/${userId}/roles`,
            {
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "name", order: "ASC" },
              filter: {},
            },
          );
          assigned = ass.data;
        } else {
          const all = await dataProvider.getList<RoleRecord>("roles", {
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "name", order: "ASC" },
            filter: {},
          });
          allRoles = all.data;
          const ass = await dataProvider.getList<RoleRecord>(
            `users/${userId}/roles`,
            {
              pagination: { page: 1, perPage: 1000 },
              sort: { field: "name", order: "ASC" },
              filter: {},
            },
          );
          assigned = ass.data;
        }
        const assignedSet = new Set(assigned.map((r) => r.id));
        setAvailable(allRoles.filter((r) => !assignedSet.has(r.id)));
      } catch {
        notify("Error loading roles", { type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orgId, userId, dataProvider, notify]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    try {
      const payload = { roles: Array.from(selected) };
      if (orgId === GLOBAL_ID) {
        await dataProvider.create(`users/${userId}/roles`, { data: payload });
      } else {
        await dataProvider.create(
          `organizations/${orgId}/members/${userId}/roles`,
          { data: payload },
        );
      }
      notify(
        `${selected.size} role(s) added ${
          orgId === GLOBAL_ID ? "globally" : "to organization"
        }`,
        { type: "success" },
      );
      handleClose();
      onAdded();
    } catch {
      notify("Error adding roles", { type: "error" });
    }
  };

  return (
    <>
      <Button type="button" onClick={handleOpen}>
        <Plus className="h-4 w-4 mr-1" />
        Add role
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add roles</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select
              value={orgId}
              onValueChange={(v) => {
                setOrgId(v);
                setSelected(new Set());
                setSearch("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL_ID}>
                  Global (No organization)
                </SelectItem>
                {userOrgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.display_name || o.name || o.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {available.length > 5 && (
              <Input
                placeholder="Search roles"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            <div className="max-h-72 overflow-auto border rounded-md">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : available.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  This user already has all available roles
                  {orgId === GLOBAL_ID ? " globally" : " in this organization"}.
                </p>
              ) : (
                (() => {
                  const q = search.trim().toLowerCase();
                  const filtered = q
                    ? available.filter((r) =>
                        [r.name, r.description, r.id]
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
                      {filtered.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-start gap-2 p-2"
                        >
                          <Checkbox
                            id={`role-${r.id}`}
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggle(r.id)}
                          />
                          <label
                            htmlFor={`role-${r.id}`}
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
                  );
                })()
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
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

export function RolesTab() {
  const { id: userId } = useParams();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const { rows, loading, reload } = useUserRoles(userId);

  const handleRemove = async (row: UserRoleRow) => {
    if (!userId) return;
    try {
      if (row.role_context === "global") {
        await dataProvider.delete(`users/${userId}/roles`, {
          id: row.id,
          previousData: row,
        });
      } else {
        await dataProvider.delete(
          `organizations/${row.organization_id}/members/${userId}/roles`,
          {
            id: row.id,
            previousData: { id: row.id, roles: [row.id] },
          },
        );
      }
      notify("Role removed", { type: "success" });
      reload();
    } catch {
      notify("Error removing role", { type: "error" });
    }
  };

  if (!userId) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <AddRoleDialog userId={userId} onAdded={reload} />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No roles assigned</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.id}-${row.organization_id ?? "global"}`}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.description || "-"}</TableCell>
                <TableCell
                  className={
                    row.role_context === "global"
                      ? "italic text-muted-foreground"
                      : "text-primary"
                  }
                >
                  {row.organization_name}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.id}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove role"
                    onClick={() => handleRemove(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
