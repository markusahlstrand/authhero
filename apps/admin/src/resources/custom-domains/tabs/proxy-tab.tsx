import { useEffect, useState } from "react";
import type { RaRecord } from "ra-core";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
} from "ra-core";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";

interface ProxyRouteRecord extends RaRecord {
  custom_domain_id: string;
  priority: number;
  path_pattern: string;
  upstream_type: "http" | "authhero" | "redirect";
  upstream_url: string;
  preserve_host: boolean;
}

interface CustomDomainRecord {
  id?: string;
  custom_domain_id?: string;
}

function useCustomDomainId(): string | undefined {
  const record = useRecordContext<CustomDomainRecord>();
  return record?.custom_domain_id ?? (record?.id as string | undefined);
}

function AddProxyRouteButton({
  customDomainId,
  onAdded,
}: {
  customDomainId: string;
  onAdded: () => void;
}) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pathPattern, setPathPattern] = useState("/");
  const [priority, setPriority] = useState("100");
  const [upstreamType, setUpstreamType] =
    useState<ProxyRouteRecord["upstream_type"]>("http");
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [preserveHost, setPreserveHost] = useState(false);

  const reset = () => {
    setPathPattern("/");
    setPriority("100");
    setUpstreamType("http");
    setUpstreamUrl("");
    setPreserveHost(false);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleAdd = async () => {
    if (!upstreamUrl.trim()) {
      notify("Upstream URL is required", { type: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const parsedPriority = Number(priority);
      await dataProvider.create("proxy-routes", {
        data: {
          custom_domain_id: customDomainId,
          priority: Number.isFinite(parsedPriority) ? parsedPriority : 100,
          path_pattern: pathPattern,
          upstream_type: upstreamType,
          upstream_url: upstreamUrl,
          preserve_host: preserveHost,
          middleware: [],
        },
      });
      notify("Proxy route added", { type: "success" });
      handleClose();
      onAdded();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to add proxy route",
        { type: "error" },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add route
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add proxy route</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="path-pattern">Path pattern</Label>
              <Input
                id="path-pattern"
                value={pathPattern}
                onChange={(e) => setPathPattern(e.target.value)}
                placeholder="/, /account/*, /api/*"
              />
              <p className="text-xs text-muted-foreground">
                Exact match, prefix, or <code>/prefix/*</code>. <code>/</code>{" "}
                matches everything.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="upstream-type">Upstream type</Label>
              <Select
                value={upstreamType}
                onValueChange={(v) =>
                  setUpstreamType(v as ProxyRouteRecord["upstream_type"])
                }
              >
                <SelectTrigger id="upstream-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="authhero">AuthHero</SelectItem>
                  <SelectItem value="redirect">Redirect (302)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="upstream-url">Upstream URL</Label>
              <Input
                id="upstream-url"
                value={upstreamUrl}
                onChange={(e) => setUpstreamUrl(e.target.value)}
                placeholder="https://account.vercel.app"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lower wins. Ties broken by creation order.
              </p>
            </div>
            {upstreamType !== "redirect" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="preserve-host"
                  checked={preserveHost}
                  onCheckedChange={setPreserveHost}
                />
                <Label htmlFor="preserve-host">
                  Preserve original Host header
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAdd} disabled={submitting}>
              Add route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RemoveRouteButton({
  route,
  onRemoved,
}: {
  route: ProxyRouteRecord;
  onRemoved: () => void;
}) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [open, setOpen] = useState(false);

  const handleRemove = async () => {
    try {
      await dataProvider.delete("proxy-routes", {
        id: route.id,
        previousData: route,
      });
      notify("Proxy route removed", { type: "success" });
      setOpen(false);
      onRemoved();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to remove proxy route",
        { type: "error" },
      );
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove route"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove proxy route</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove the route <strong>{route.path_pattern}</strong> →{" "}
            <strong>{route.upstream_url}</strong>?
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProxyTab() {
  const customDomainId = useCustomDomainId();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [routes, setRoutes] = useState<ProxyRouteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!customDomainId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    dataProvider
      .getList<ProxyRouteRecord>("proxy-routes", {
        pagination: { page: 1, perPage: 100 },
        sort: { field: "priority", order: "ASC" },
        filter: { custom_domain_id: customDomainId },
      })
      .then(({ data }) => {
        if (!cancelled) setRoutes(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load proxy routes";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customDomainId, dataProvider, reloadKey, notify]);

  if (!customDomainId) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the custom domain before configuring proxy routes.
      </p>
    );
  }

  const refresh = () => setReloadKey((k) => k + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-prose">
          <h3 className="text-base font-medium">Proxy routes</h3>
          <p className="text-sm text-muted-foreground">
            Configure how requests to this custom domain are dispatched. Routes
            are matched in priority order (lowest wins) and each can point to
            an HTTP upstream (e.g. a Vercel app), to AuthHero, or to a redirect.
          </p>
        </div>
        <AddProxyRouteButton
          customDomainId={customDomainId}
          onAdded={refresh}
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Could not load proxy routes</p>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-muted-foreground mt-2">
            This API requires the <code>@authhero/proxy</code> management router
            to be mounted on your AuthHero deployment at{" "}
            <code>/api/v2/proxy-routes</code>.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : routes.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground py-4">
          No proxy routes configured for this domain yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Upstream</th>
                <th className="px-3 py-2 font-medium">Host</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 tabular-nums">{r.priority}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.path_pattern}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{r.upstream_type}</Badge>
                  </td>
                  <td className="px-3 py-2 break-all">{r.upstream_url}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.preserve_host ? "preserve" : "rewrite"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RemoveRouteButton route={r} onRemoved={refresh} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
