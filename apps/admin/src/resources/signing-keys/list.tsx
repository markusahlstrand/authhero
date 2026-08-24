import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Copy, Download, KeyRound, RefreshCw, ShieldOff } from "lucide-react";
import { DataTable, List } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateAgo } from "@/common/DateAgo";
import type {
  AuthHeroDataProvider,
  SigningKeyType,
} from "../../auth0DataProvider";

interface SigningKeyRecord {
  id: string;
  kid: string;
  tenant_id?: string;
  inherited?: boolean;
  cert?: string;
  fingerprint?: string;
  thumbprint?: string;
  current?: boolean;
  next?: boolean;
  previous?: boolean;
  revoked?: boolean;
  current_since?: string;
  current_until?: string;
  revoked_at?: string;
  expires_at?: string;
  expired?: boolean;
}

// SAML certificates are pinned by each service provider, so a rotation only
// works if they get the new certificate before it starts signing. These
// defaults give a week to do that, and keep the old certificate valid for a
// week after the switch in case one of them lags behind.
const SAML_ROTATION_DEFAULTS = { activateInDays: 7, graceDays: 7 };
const JWT_ROTATION_DEFAULTS = { activateInDays: 0, graceDays: 1 };

const EXPIRY_WARNING_DAYS = 60;

function daysUntil(date: string): number {
  return Math.round(
    (new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
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
    const scheduled =
      record.revoked_at && new Date(record.revoked_at) > new Date();
    return (
      <Badge variant="destructive">{scheduled ? "Retiring" : "Revoked"}</Badge>
    );
  }
  if (record.current) return <Badge>Current</Badge>;
  if (record.next) return <Badge variant="secondary">Next</Badge>;
  if (record.previous) return <Badge variant="outline">Previous</Badge>;
  return <Badge variant="outline">Active</Badge>;
}

/**
 * Where the key comes from. An inherited key belongs to the control plane —
 * this tenant only verifies with it — so the console offers no way to change
 * it, and the API refuses if asked anyway.
 */
function ScopeCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record) return null;
  if (record.inherited) {
    return (
      <Badge
        variant="outline"
        title="Owned by the control plane. Read-only here."
      >
        Inherited
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title={record.tenant_id ?? "Control plane"}>
      {record.tenant_id ? "Tenant" : "Control plane"}
    </Badge>
  );
}

function ExpiresCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.expires_at) return <>-</>;
  if (record.expired) {
    return <Badge variant="destructive">Expired</Badge>;
  }
  const days = daysUntil(record.expires_at);
  return (
    <span
      className={days <= EXPIRY_WARNING_DAYS ? "text-destructive" : undefined}
      title={new Date(record.expires_at).toISOString()}
    >
      in {days} days
    </span>
  );
}

function CurrentSinceCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.current_since) return <>-</>;
  const since = new Date(record.current_since);
  if (since > new Date()) {
    return <span>activates in {daysUntil(record.current_since)} days</span>;
  }
  return <DateAgo date={record.current_since} />;
}

function RevokedAtCell() {
  const record = useRecordContext<SigningKeyRecord>();
  if (!record?.revoked_at) return <>-</>;
  return <DateAgo date={record.revoked_at} />;
}

/**
 * The certificate a service provider needs. Everything a SAML integration asks
 * for — the PEM itself and the fingerprints some providers ask you to confirm
 * out-of-band — is here so it can be handed over without a database round trip.
 */
function ViewCertificateCell() {
  const record = useRecordContext<SigningKeyRecord>();
  const notify = useNotify();
  const [open, setOpen] = useState(false);

  if (!record?.cert) return null;

  const copy = () => {
    navigator.clipboard
      .writeText(record.cert!)
      .then(() =>
        notify("Certificate copied to clipboard", { type: "success" }),
      )
      .catch(() => notify("Failed to copy to clipboard", { type: "warning" }));
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([record.cert!], { type: "application/x-pem-file" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.kid}.pem`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="View certificate"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Certificate</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Key ID</dt>
            <dd className="font-mono break-all">{record.kid}</dd>
            <dt className="text-muted-foreground">Fingerprint</dt>
            <dd className="font-mono break-all">{record.fingerprint}</dd>
            <dt className="text-muted-foreground">Thumbprint (SHA-1)</dt>
            <dd className="font-mono break-all">{record.thumbprint}</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd>
              {record.expires_at
                ? new Date(record.expires_at).toUTCString()
                : "unknown"}
            </dd>
          </dl>
          <pre className="max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-[10px] leading-tight">
            {record.cert}
          </pre>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={download}>
              <Download className="mr-1 h-4 w-4" />
              Download PEM
            </Button>
            <Button type="button" onClick={copy}>
              <Copy className="mr-1 h-4 w-4" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenewKeyCell({ type }: { type: SigningKeyType }) {
  const record = useRecordContext<SigningKeyRecord>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!record) return null;
  if (record.revoked || record.revoked_at) return null;
  if (record.inherited) return null;

  const handleRenew = async () => {
    setBusy(true);
    try {
      await dataProvider.renewSigningKey(record.kid, { type });
      notify("Certificate renewed", { type: "success" });
      setOpen(false);
      refresh();
    } catch {
      notify("Failed to renew certificate", { type: "error" });
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
        aria-label="Renew certificate"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew certificate</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Issue a new certificate for this key without changing the key
            itself. The key ID and public key stay the same, so anything that
            validates against the public key keeps working untouched — only a
            service provider that pinned the certificate bytes needs the new
            file.
          </p>
          <p className="text-sm text-muted-foreground">
            To replace the key material instead, rotate.
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
            <Button type="button" disabled={busy} onClick={handleRenew}>
              Renew
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevokeKeyCell({ type }: { type: SigningKeyType }) {
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
  // An inherited key belongs to the control plane; revoking it here would only
  // break this tenant's ability to verify what the control plane still signs.
  if (record.inherited) return null;

  const handleRevoke = async () => {
    setBusy(true);
    try {
      await dataProvider.revokeSigningKey(record.kid, type);
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
            Revoke key <span className="font-mono text-xs">{record.kid}</span>?
            A replacement key will be created and used to sign new tokens.
            {type === "saml_encryption"
              ? " Every service provider still trusting this certificate will reject assertions immediately."
              : " Tokens signed by the revoked key will no longer validate."}
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

function RotateSigningKeyButton({ type }: { type: SigningKeyType }) {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const isSaml = type === "saml_encryption";
  const defaults = isSaml ? SAML_ROTATION_DEFAULTS : JWT_ROTATION_DEFAULTS;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activateInDays, setActivateInDays] = useState(
    String(defaults.activateInDays),
  );
  const [graceDays, setGraceDays] = useState(String(defaults.graceDays));

  const handleRotate = async () => {
    setBusy(true);
    try {
      await dataProvider.rotateSigningKeys({
        type,
        activateInDays: Number(activateInDays),
        graceDays: Number(graceDays),
      });
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
        <KeyRound className="mr-1 h-4 w-4" />
        Rotate {isSaml ? "SAML certificate" : "Signing Key"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rotate {isSaml ? "SAML certificate" : "signing key"}
            </DialogTitle>
          </DialogHeader>
          {isSaml ? (
            <p className="text-sm">
              Create a new key pair and publish its certificate in the SAML
              metadata straight away, but keep signing with the current one
              until it activates. Send the new certificate to every service
              provider during that window — they cannot fetch it themselves, and
              assertions signed by a certificate they don't trust are rejected.
            </p>
          ) : (
            <p className="text-sm">
              Create a new signing key and schedule revocation of the current
              key. New tokens will be signed with the new key immediately;
              existing keys remain valid during the grace period.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="activate-in-days">Activates in (days)</Label>
              <Input
                id="activate-in-days"
                type="number"
                min={0}
                max={365}
                value={activateInDays}
                onChange={(e) => setActivateInDays(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="grace-days">Old key valid for (days)</Label>
              <Input
                id="grace-days"
                type="number"
                min={0}
                max={365}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The old key is revoked {graceDays || 0} day(s) after the new one
            activates.
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

function SigningKeyTable({ type }: { type: SigningKeyType }) {
  return (
    <List
      filter={{ type }}
      sort={{ field: "current_since", order: "DESC" }}
      actions={
        <div className="flex items-center gap-2">
          <RotateSigningKeyButton type={type} />
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
        <DataTable.Col label="Scope">
          <ScopeCell />
        </DataTable.Col>
        <DataTable.Col label="Expires">
          <ExpiresCell />
        </DataTable.Col>
        <DataTable.Col label="Current since">
          <CurrentSinceCell />
        </DataTable.Col>
        <DataTable.Col label="Revoked">
          <RevokedAtCell />
        </DataTable.Col>
        <DataTable.Col label="">
          <div className="flex justify-end gap-1">
            <ViewCertificateCell />
            <RenewKeyCell type={type} />
            <RevokeKeyCell type={type} />
          </div>
        </DataTable.Col>
      </DataTable>
    </List>
  );
}

export function SigningKeysList() {
  return (
    <UrlTabs defaultValue="jwt_signing" param="key_type" className="w-full">
      <TabsList>
        <TabsTrigger value="jwt_signing">JWT signing</TabsTrigger>
        <TabsTrigger value="saml_encryption">SAML</TabsTrigger>
      </TabsList>
      <TabsContent value="jwt_signing" className="mt-4">
        <SigningKeyTable type="jwt_signing" />
      </TabsContent>
      <TabsContent value="saml_encryption" className="mt-4">
        <SigningKeyTable type="saml_encryption" />
      </TabsContent>
    </UrlTabs>
  );
}
