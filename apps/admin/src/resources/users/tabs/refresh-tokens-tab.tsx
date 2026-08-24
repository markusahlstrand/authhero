import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Confirm } from "@/components/admin/confirm";
import {
  DataTable,
  DateField,
  ListPagination,
  ReferenceField,
  ReferenceManyField,
  TextField,
} from "@/components/admin";
import type { AuthHeroDataProvider } from "@/auth0DataProvider";
import type { UserRecord } from "./types";

interface RefreshTokenRecord {
  id: string;
  client_id?: string;
  login_id?: string;
  created_at?: string;
  expires_at?: string;
  idle_expires_at?: string;
  last_exchanged_at?: string;
  revoked_at?: string | null;
  rotating?: boolean;
  resource_servers?: { audience: string; scopes: string }[];
  device?: {
    last_ip?: string;
    last_user_agent?: string;
  };
}

function ClientCell() {
  const record = useRecordContext<RefreshTokenRecord>();
  if (!record?.client_id) return <>-</>;
  return (
    <ReferenceField
      source="client_id"
      reference="clients"
      link="edit"
      empty={record.client_id}
    >
      <TextField source="name" />
    </ReferenceField>
  );
}

function AudienceCell() {
  const record = useRecordContext<RefreshTokenRecord>();
  if (!record?.resource_servers?.length) return <>-</>;
  return (
    <div className="flex flex-wrap gap-1">
      {record.resource_servers.map((rs) => (
        <Badge key={rs.audience} variant="secondary">
          {rs.audience}
        </Badge>
      ))}
    </div>
  );
}

function StatusCell() {
  const record = useRecordContext<RefreshTokenRecord>();
  if (!record) return null;
  if (record.revoked_at) return <Badge variant="destructive">Revoked</Badge>;
  // Either expiry elapsing means the token can no longer be exchanged, so both
  // are checked independently — a token with a distant absolute expiry can
  // still be dead on its idle one.
  const elapsed = (value?: string) =>
    !!value && new Date(value).getTime() < Date.now();
  if (elapsed(record.expires_at) || elapsed(record.idle_expires_at)) {
    return <Badge variant="outline">Expired</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
}

function RevokeTokenCell() {
  const record = useRecordContext<RefreshTokenRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!record) return null;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await dataProvider.delete("refresh-tokens", {
        id: record.id,
        previousData: record,
      });
      notify("Refresh token revoked", { type: "success" });
      setOpen(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error revoking refresh token", error);
      notify("Error revoking refresh token: " + message, { type: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Revoke refresh token"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Confirm
        isOpen={open}
        title="Revoke this refresh token?"
        content="The whole rotation chain is revoked, so the application will have to send the user through login again."
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
        loading={pending}
      />
    </>
  );
}

function RevokeAllButton() {
  const user = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!user) return null;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await dataProvider.revokeUserRefreshTokens(String(user.id));
      notify("All refresh tokens revoked", { type: "success" });
      setOpen(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error revoking refresh tokens", error);
      notify("Error revoking refresh tokens: " + message, { type: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Revoke all refresh tokens
      </Button>
      <Confirm
        isOpen={open}
        title="Revoke all refresh tokens?"
        content="Every refresh token this user holds is invalidated. Applications keep working until their current access token expires, then have to send the user through login again."
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
        loading={pending}
      />
    </>
  );
}

export function RefreshTokensTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RevokeAllButton />
      </div>
      <ReferenceManyField
        reference="refresh-tokens"
        target="user_id"
        sort={{ field: "created_at", order: "DESC" }}
        perPage={10}
        pagination={<ListPagination />}
        empty={
          <p className="text-sm text-muted-foreground py-4">
            No refresh tokens found
          </p>
        }
      >
        <DataTable rowClick={false} bulkActionButtons={false}>
          <DataTable.Col source="id" />
          <DataTable.Col label="Application">
            <ClientCell />
          </DataTable.Col>
          <DataTable.Col label="Audience">
            <AudienceCell />
          </DataTable.Col>
          <DataTable.Col label="Last used">
            <DateField source="last_exchanged_at" showTime empty="-" />
          </DataTable.Col>
          <DataTable.Col label="Expires at">
            <DateField source="expires_at" showTime empty="-" />
          </DataTable.Col>
          <DataTable.Col label="IP">
            <TextField source="device.last_ip" empty="-" />
          </DataTable.Col>
          <DataTable.Col label="Created at">
            <DateField source="created_at" showTime empty="-" />
          </DataTable.Col>
          <DataTable.Col label="Status">
            <StatusCell />
          </DataTable.Col>
          <DataTable.Col label="">
            <div className="flex justify-end">
              <RevokeTokenCell />
            </div>
          </DataTable.Col>
        </DataTable>
      </ReferenceManyField>
    </div>
  );
}
