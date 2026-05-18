import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { KeyRound, ShieldOff } from "lucide-react";
import { DataTable, List } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateAgo } from "@/common/DateAgo";
import type { AuthHeroDataProvider } from "../../auth0DataProvider";

interface SigningKeyRecord {
  id: string;
  kid: string;
  fingerprint?: string;
  thumbprint?: string;
  current?: boolean;
  next?: boolean;
  previous?: boolean;
  revoked?: boolean;
  current_since?: string;
  current_until?: string;
  revoked_at?: string;
}

function KidCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.kid) return <>-</>;
  return (
    <span className="font-mono text-xs" title={record.kid}>
      {record.kid.length > 24 ? `${record.kid.slice(0, 24)}…` : record.kid}
    </span>
  );
}

function StatusCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record) return null;
  if (record.revoked || record.revoked_at) {
    return <Badge variant="destructive">Revoked</Badge>;
  }
  if (record.current) return <Badge>Current</Badge>;
  if (record.next) return <Badge variant="secondary">Next</Badge>;
  if (record.previous) return <Badge variant="outline">Previous</Badge>;
  return <Badge variant="outline">Active</Badge>;
}

function CurrentSinceCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.current_since) return <>-</>;
  return <DateAgo date={record.current_since} />;
}

function RevokedAtCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.revoked_at) return <>-</>;
  return <DateAgo date={record.revoked_at} />;
}

function RevokeKeyCell() {
  const record = useRecordContext<SigningKeyRecord>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!record) return null;
  // Revoking an already-revoked key isn't meaningful; the backend would just
  // mint a fresh replacement on every click.
  if (record.revoked || record.revoked_at) return null;

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await dataProvider.revokeSigningKey(record.kid);
      notify("Signing key revoked", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Failed to revoke signing key", { type: "error" });
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
        aria-label="Revoke signing key"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ShieldOff className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke signing key</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Revoke key{" "}
            <span className="font-mono text-xs">{record.kid}</span>? A
            replacement key will be created and used to sign new tokens.
            Tokens signed by the revoked key will no longer validate.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={handleRevoke}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RotateSigningKeyButton() {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleRotate = async () => {
    setBusy(true);
    try {
      await dataProvider.rotateSigningKeys();
      notify("Signing key rotated", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Failed to rotate signing key", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <KeyRound className="h-4 w-4 mr-1" />
        Rotate Signing Key
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate signing key</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Create a new signing key and schedule revocation of the current
            key. New tokens will be signed with the new key immediately;
            existing keys remain valid during a 24-hour grace period.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={handleRotate}>
              Rotate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SigningKeysList() {
  return (
    <List
      sort={{ field: "current_since", order: "DESC" }}
      actions={
        <div className="flex items-center gap-2">
          <RotateSigningKeyButton />
        </div>
      }
    >
      <DataTable rowClick={false} bulkActionButtons={false}>
        <DataTable.Col label="Key ID">
          <KidCell />
        </DataTable.Col>
        <DataTable.Col label="Status">
          <StatusCell />
        </DataTable.Col>
        <DataTable.Col label="Current since">
          <CurrentSinceCell />
        </DataTable.Col>
        <DataTable.Col label="Revoked">
          <RevokedAtCell />
        </DataTable.Col>
        <DataTable.Col label="">
          <div className="flex justify-end gap-1">
            <RevokeKeyCell />
          </div>
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
