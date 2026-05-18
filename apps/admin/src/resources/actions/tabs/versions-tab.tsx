import { Fragment, useCallback, useEffect, useState } from "react";
import {
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import { useTenantId } from "@/TenantContext";
import {
  buildUrlWithProtocol,
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";

type ActionVersion = {
  id: string;
  number: number;
  code: string;
  runtime?: string;
  deployed: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

function isActionVersion(value: unknown): value is ActionVersion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.number === "number" &&
    typeof v.code === "string" &&
    typeof v.deployed === "boolean"
  );
}

function getApiUrl(): string {
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain,
  );
  let apiUrl: string;
  if (domainConfig?.restApiUrl) {
    apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
  } else if (selectedDomain) {
    apiUrl = buildUrlWithProtocol(selectedDomain);
  } else {
    apiUrl = buildUrlWithProtocol(getConfigValue("apiUrl"));
  }
  return apiUrl.replace(/\/$/, "");
}

function getHttpClient(tenantId: string) {
  const formattedDomain = formatDomain(getSelectedDomainFromStorage());
  if (isSingleTenantForDomain(formattedDomain)) {
    return authorizedHttpClient;
  }
  return createOrganizationHttpClient(tenantId);
}

export function VersionsTab() {
  const record = useRecordContext<{ id?: string }>();
  const tenantId = useTenantId() ?? "";
  const notify = useNotify();
  const refresh = useRefresh();

  const [versions, setVersions] = useState<ActionVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingRollback, setPendingRollback] = useState<ActionVersion | null>(
    null,
  );
  const [rolling, setRolling] = useState(false);

  const actionId = record?.id ? String(record.id) : undefined;

  const loadVersions = useCallback(async () => {
    if (!actionId) return;
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      const response = await httpClient(
        `${apiUrl}/api/v2/actions/actions/${actionId}/versions`,
        {
          headers: new Headers({ "tenant-id": tenantId }),
        },
      );
      const json =
        response && typeof response === "object" && "json" in response
          ? (response as { json: unknown }).json
          : undefined;
      const items =
        json && typeof json === "object" && "versions" in json
          ? (json as { versions: unknown[] }).versions
          : Array.isArray(json)
            ? (json as unknown[])
            : [];
      setVersions(items.filter(isActionVersion));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Failed to load versions: ${message}`, { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [actionId, tenantId, notify]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleRollback = async () => {
    if (!actionId || !pendingRollback) return;
    setRolling(true);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      await httpClient(
        `${apiUrl}/api/v2/actions/actions/${actionId}/versions/${pendingRollback.id}/deploy`,
        {
          method: "POST",
          body: JSON.stringify({}),
          headers: new Headers({
            "tenant-id": tenantId,
            "content-type": "application/json",
          }),
        },
      );
      notify(`Rolled back to version ${pendingRollback.number}`, {
        type: "success",
      });
      setPendingRollback(null);
      await loadVersions();
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Rollback failed: ${message}`, { type: "error" });
    } finally {
      setRolling(false);
    }
  };

  if (!actionId) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the action before viewing versions.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Versions</CardTitle>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every save and deploy creates a new version. Pick an earlier
            version to roll back to its code, runtime, secrets and dependencies.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadVersions}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && versions.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No versions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const expanded = expandedId === v.id;
                return (
                  <Fragment key={v.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={expanded ? "Collapse" : "Expand"}
                          onClick={() =>
                            setExpandedId(expanded ? null : v.id)
                          }
                        >
                          {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>v{v.number}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {v.deployed && (
                            <Badge variant="default">Deployed</Badge>
                          )}
                          {v.status && (
                            <Badge variant="outline">{v.status}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.created_at
                          ? new Date(v.created_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingRollback(v)}
                          disabled={v.deployed}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Roll back
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/50">
                          <pre className="m-0 p-2 font-mono text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">
                            {v.code}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={pendingRollback !== null}
        onOpenChange={(open) => !open && setPendingRollback(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Roll back to version {pendingRollback?.number}?
            </DialogTitle>
            <DialogDescription>
              This will replace the action's current code, runtime, secrets and
              dependencies with this version, redeploy it, and record a new
              version capturing the rollback.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRollback(null)}
              disabled={rolling}
            >
              Cancel
            </Button>
            <Button onClick={handleRollback} disabled={rolling}>
              {rolling ? "Rolling back…" : "Roll back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
