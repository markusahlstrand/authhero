import { useEffect, useMemo, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Link2, Link2Off, Pencil, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextInput } from "@/components/admin";
import { Strategy } from "@/utils/Strategy";
import { getUserAvatarColor, getUserAvatarSeed } from "@/utils/userAvatar";
import type { UserIdentity, UserRecord } from "./types";

function getInitials(record: UserRecord): string {
  const name =
    record.name ||
    [record.given_name, record.family_name].filter(Boolean).join(" ") ||
    record.nickname ||
    record.email ||
    record.username ||
    "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserHeader() {
  const record = useRecordContext<UserRecord>();
  if (!record) return null;
  const displayName =
    record.name ||
    [record.given_name, record.family_name].filter(Boolean).join(" ") ||
    record.nickname ||
    record.email ||
    record.username ||
    String(record.id);
  const subtitle =
    record.email && record.email !== displayName ? record.email : undefined;

  const bg = getUserAvatarColor(getUserAvatarSeed(record));

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20">
        {record.picture && (
          <AvatarImage src={record.picture} alt={displayName} />
        )}
        <AvatarFallback
          className="text-xl"
          style={{ backgroundColor: bg, color: "white" }}
        >
          {getInitials(record)}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <h2 className="text-xl font-semibold">{displayName}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function jsonFormat(value: unknown): string {
  if (value === undefined || value === null) return "{}";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  if (typeof value === "object" && Object.keys(value).length === 0) {
    return "{}";
  }
  return JSON.stringify(value, null, 2);
}

function jsonParse(value: string): unknown {
  if (!value?.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

interface EditFieldDialogProps {
  open: boolean;
  onClose: () => void;
  field: "email" | "username" | "phone_number";
  label: string;
  verifiedField?: "email_verified" | "phone_verified";
}

function EditFieldDialog({
  open,
  onClose,
  field,
  label,
  verifiedField,
}: EditFieldDialogProps) {
  const record = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [value, setValue] = useState("");
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && record) {
      setValue(record[field] ?? "");
      if (verifiedField) {
        setVerified(!!record[verifiedField]);
      }
    }
  }, [open, record, field, verifiedField]);

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { [field]: value };
      if (verifiedField) data[verifiedField] = verified;
      await dataProvider.update("users", {
        id: record.id,
        data,
        previousData: record,
      });
      notify(`${label} updated`, { type: "success" });
      refresh();
      onClose();
    } catch {
      notify(`Error updating ${label.toLowerCase()}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`edit-${field}`}>{label}</Label>
            <Input
              id={`edit-${field}`}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>
          {verifiedField && (
            <div className="flex items-center gap-2">
              <Switch
                id={`edit-${field}-verified`}
                checked={verified}
                onCheckedChange={setVerified}
              />
              <Label htmlFor={`edit-${field}-verified`}>Verified</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdentityRow({
  label,
  value,
  verified,
  onEdit,
}: {
  label: string;
  value?: string;
  verified?: boolean | null;
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm">{value || "—"}</span>
        {value && verified !== null && verified !== undefined && (
          <Badge variant={verified ? "default" : "secondary"}>
            {verified ? "Verified" : "Unverified"}
          </Badge>
        )}
        {onEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={`Edit ${label}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function IdentityCard() {
  const record = useRecordContext<UserRecord>();
  const [editing, setEditing] = useState<{
    field: "email" | "username" | "phone_number";
    label: string;
    verifiedField?: "email_verified" | "phone_verified";
  } | null>(null);

  if (!record) return null;
  const linkedCount = Math.max((record.identities?.length ?? 1) - 1, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdentityRow
              label="Email"
              value={record.email}
              verified={record.email ? !!record.email_verified : null}
              onEdit={() =>
                setEditing({
                  field: "email",
                  label: "Email",
                  verifiedField: "email_verified",
                })
              }
            />
            <IdentityRow
              label="Username"
              value={record.username}
              onEdit={() =>
                setEditing({ field: "username", label: "Username" })
              }
            />
            <IdentityRow
              label="Phone Number"
              value={record.phone_number}
              verified={record.phone_number ? !!record.phone_verified : null}
              onEdit={() =>
                setEditing({
                  field: "phone_number",
                  label: "Phone Number",
                  verifiedField: "phone_verified",
                })
              }
            />
            <IdentityRow
              label="User ID"
              value={record.user_id ?? String(record.id)}
            />
            <IdentityRow
              label="Signed Up"
              value={
                record.created_at
                  ? new Date(record.created_at).toLocaleString()
                  : undefined
              }
            />
            <IdentityRow
              label="Primary Identity Provider"
              value={record.connection}
            />
            <IdentityRow
              label="Latest Login"
              value={
                record.last_login
                  ? new Date(record.last_login).toLocaleString()
                  : "Never"
              }
            />
            <IdentityRow
              label="Linked Accounts"
              value={
                linkedCount === 0
                  ? "None"
                  : `${linkedCount} account${linkedCount !== 1 ? "s" : ""}`
              }
            />
          </div>
        </CardContent>
      </Card>
      {editing && (
        <EditFieldDialog
          open
          onClose={() => setEditing(null)}
          field={editing.field}
          label={editing.label}
          verifiedField={editing.verifiedField}
        />
      )}
    </>
  );
}

function UnlinkIdentityButton({ identity }: { identity: UserIdentity }) {
  const record = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);

  if (!record || identity.provider === "auth0") return null;

  const handleUnlink = async () => {
    try {
      await dataProvider.delete(
        `users/${record.id}/identities/${identity.provider}`,
        { id: identity.user_id },
      );
      notify("Identity unlinked", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Error unlinking identity", { type: "error" });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Unlink identity"
        onClick={() => setOpen(true)}
      >
        <Link2Off className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink identity</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink {identity.provider}/
              {identity.user_id}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleUnlink}>
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IdentitiesTable() {
  const record = useRecordContext<UserRecord>();
  const identities = record?.identities ?? [];
  if (identities.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Connection</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>User ID</TableHead>
          <TableHead>Social</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.map((identity) => (
          <TableRow key={`${identity.provider}-${identity.user_id}`}>
            <TableCell>{identity.connection}</TableCell>
            <TableCell>{identity.provider}</TableCell>
            <TableCell className="font-mono text-xs">
              {identity.user_id}
            </TableCell>
            <TableCell>{identity.isSocial ? "Yes" : "No"}</TableCell>
            <TableCell>
              <UnlinkIdentityButton identity={identity} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LinkUserButton() {
  const record = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserRecord[]>([]);

  const reset = () => {
    setSearchText("");
    setResults([]);
  };
  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const search = async () => {
    if (!searchText.trim() || !record) return;
    setSearching(true);
    try {
      const { data } = await dataProvider.getList<UserRecord>("users", {
        pagination: { page: 1, perPage: 10 },
        sort: { field: "email", order: "ASC" },
        filter: { q: searchText },
      });
      setResults(data.filter((u) => u.id !== record.id));
    } catch {
      notify("Error searching for users", { type: "error" });
    } finally {
      setSearching(false);
    }
  };

  const link = async (userId: string | number) => {
    if (!record) return;
    try {
      await dataProvider.create(`users/${userId}/identities`, {
        data: { link_with: record.id },
      });
      notify("User linked", { type: "success" });
      handleClose();
      refresh();
    } catch {
      notify("Error linking users", { type: "error" });
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4 mr-2" />
        Link user
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link user</DialogTitle>
            <DialogDescription>
              Search for a user to link this user to.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Search by email"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <Button onClick={search} disabled={searching || !searchText.trim()}>
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>
          <div className="max-h-72 overflow-auto">
            {searching ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Searching…
              </p>
            ) : results.length > 0 ? (
              <ul className="divide-y">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full text-left py-2 px-1 hover:bg-muted rounded"
                      onClick={() => link(u.id)}
                    >
                      <div className="text-sm font-medium">
                        {u.email || u.phone_number || u.id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: {u.id} · Connection: {u.connection}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchText ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No users found
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordChangeSection() {
  const record = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const hasPasswordIdentity = useMemo(() => {
    if (!record) return false;
    if (record.connection === Strategy.USERNAME_PASSWORD) return true;
    return (record.identities ?? []).some(
      (i) => i.connection === Strategy.USERNAME_PASSWORD,
    );
  }, [record]);

  if (!hasPasswordIdentity || !record) return null;

  const handleClose = () => {
    setOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSave = async () => {
    if (!newPassword) {
      notify("Please enter a new password", { type: "warning" });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("Passwords do not match", { type: "warning" });
      return;
    }
    if (newPassword.length < 8) {
      notify("Password must be at least 8 characters", { type: "warning" });
      return;
    }
    setSaving(true);
    try {
      await dataProvider.update("users", {
        id: record.id,
        data: {
          password: newPassword,
          connection: Strategy.USERNAME_PASSWORD,
        },
        previousData: record,
      });
      notify("Password updated", { type: "success" });
      handleClose();
      refresh();
    } catch {
      notify("Error updating password", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          This user has a password connection. You can update their password
          here.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !saving &&
                    newPassword &&
                    newPassword === confirmPassword
                  ) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">
                  Passwords do not match
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving || !newPassword || newPassword !== confirmPassword
              }
            >
              {saving ? "Saving…" : "Save password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function DetailsTab() {
  return (
    <div className="flex flex-col gap-6">
      <UserHeader />
      <IdentityCard />

      <Card>
        <CardHeader>
          <CardTitle>User profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextInput source="given_name" />
            <TextInput source="family_name" />
            <TextInput source="nickname" />
          </div>
          <TextInput source="name" />
          <TextInput source="picture" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <IdentitiesTable />
          <div>
            <LinkUserButton />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput
              source="user_metadata"
              label="User metadata (JSON)"
              multiline
              format={(v: unknown) => jsonFormat(v)}
              parse={(v: string) => jsonParse(v)}
            />
            <TextInput
              source="app_metadata"
              label="App metadata (JSON)"
              multiline
              format={(v: unknown) => jsonFormat(v)}
              parse={(v: string) => jsonParse(v)}
            />
          </div>
        </CardContent>
      </Card>

      <PasswordChangeSection />
    </div>
  );
}
