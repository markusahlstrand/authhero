import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataProvider,
  useGetIdentity,
  useNotify,
} from "ra-core";
import { Loader2, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  AuthHeroDataProvider,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRoleRecord,
} from "../../auth0DataProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Per-tenant "Team" page (#1137). Lets a tenant admin manage who administers
 * this tenant — invite colleagues by email, remove admins, and edit each
 * admin's roles — without a control-plane login.
 *
 * A tenant's team is a control-plane organization, so its members are
 * control-plane users, not this tenant's end users. That is why there is no
 * "add an existing user" search here (the tenant shard can't enumerate
 * control-plane users): the way in is an email invitation, which provisions the
 * control-plane user on acceptance. Everything talks to `/api/v2/tenant-members`,
 * where the server pins the organization to the caller's token.
 */
export function TeamPage() {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();

  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitationRecord[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<TeamRoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamMemberRecord | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memberResult, invites, roles] = await Promise.all([
        dataProvider.listTeamMembers({ page: 0, perPage: 100 }),
        dataProvider.listTeamInvitations().catch(() => []),
        dataProvider.listAssignableTeamRoles().catch(() => []),
      ]);
      setMembers(memberResult.members);
      setInvitations(invites);
      setAssignableRoles(roles);
    } catch {
      notify("Unable to load the team for this tenant", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [dataProvider, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async (member: TeamMemberRecord) => {
    if (
      !window.confirm(
        `Remove ${member.email || member.name || member.user_id} from this tenant's team?`,
      )
    ) {
      return;
    }
    try {
      await dataProvider.removeTeamMembers([member.user_id]);
      notify("Member removed", { type: "success" });
      void load();
    } catch {
      notify("Error removing member", { type: "error" });
    }
  };

  const handleRevoke = async (invitation: TeamInvitationRecord) => {
    try {
      await dataProvider.revokeTeamInvitation(invitation.id);
      notify("Invitation revoked", { type: "success" });
      void load();
    } catch {
      notify("Error revoking invitation", { type: "error" });
    }
  };

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              People who can administer this tenant.
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <Mail className="mr-1 h-4 w-4" />
            Invite member
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : members.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No team members yet. Invite someone to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {member.picture ? (
                            <AvatarImage src={member.picture} alt="" />
                          ) : null}
                          <AvatarFallback>
                            {(member.email || member.name || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {member.name || member.email || member.user_id}
                          </div>
                          {member.email && member.name ? (
                            <div className="text-xs text-muted-foreground">
                              {member.email}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No roles
                          </span>
                        ) : (
                          member.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name || role.id}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit roles"
                        onClick={() => setEditing(member)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove member"
                        onClick={() => handleRemove(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="text-sm">
                    {invitation.invitee?.email || invitation.id}
                    {invitation.expires_at ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        expires{" "}
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Revoke invitation"
                    onClick={() => handleRevoke(invitation)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <EditRolesDialog
          member={editing}
          assignableRoles={assignableRoles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function EditRolesDialog({
  member,
  assignableRoles,
  onClose,
  onSaved,
}: {
  member: TeamMemberRecord;
  assignableRoles: TeamRoleRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(member.roles.map((r) => r.id)),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const before = new Set(member.roles.map((r) => r.id));
    const toAdd = [...selected].filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !selected.has(id));
    try {
      if (toAdd.length) {
        await dataProvider.assignTeamMemberRoles(member.user_id, toAdd);
      }
      if (toRemove.length) {
        await dataProvider.removeTeamMemberRoles(member.user_id, toRemove);
      }
      notify("Roles updated", { type: "success" });
      onSaved();
    } catch {
      notify("Error updating roles", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Roles for {member.name || member.email || member.user_id}
          </DialogTitle>
        </DialogHeader>
        {assignableRoles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No roles are available to assign.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-auto">
            {assignableRoles.map((role) => (
              <li key={role.id} className="flex items-start gap-2 p-1">
                <Checkbox
                  id={`role-${role.id}`}
                  checked={selected.has(role.id)}
                  onCheckedChange={() => toggle(role.id)}
                />
                <label
                  htmlFor={`role-${role.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="text-sm font-medium">
                    {role.name || role.id}
                  </div>
                  {role.description ? (
                    <div className="text-xs text-muted-foreground">
                      {role.description}
                    </div>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  // Synchronous in-flight lock: a rapid second Enter can re-enter before the
  // `busy` state settles, and invitation create is not idempotent.
  const inFlight = useRef(false);

  const reset = () => {
    setEmail("");
    setSendEmail(true);
  };

  const handleInvite = async () => {
    if (inFlight.current || busy || !email.trim()) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await dataProvider.createTeamInvitation({
        email,
        inviterName: identity?.fullName,
        sendInvitationEmail: sendEmail,
      });
      notify(`Invitation sent to ${email.trim()}`, { type: "success" });
      reset();
      onInvited();
    } catch {
      notify("Error sending invitation", { type: "error" });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleInvite();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="invite-send-email"
              checked={sendEmail}
              onCheckedChange={setSendEmail}
            />
            <Label htmlFor="invite-send-email">Send invitation email</Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInvite}
            disabled={busy || !email.trim()}
          >
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
