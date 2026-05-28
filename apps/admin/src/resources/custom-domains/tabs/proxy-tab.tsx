import { useEffect, useState } from "react";
import type { RaRecord } from "ra-core";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
} from "ra-core";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
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

type UpstreamType = "http" | "redirect";

interface HandlerConfig {
  type: string;
  options?: Record<string, unknown>;
}

interface RouteMatch {
  path?: string;
  hosts?: string[];
  methods?: string[];
}

interface ProxyRouteRecord extends RaRecord {
  custom_domain_id: string;
  priority: number;
  match?: RouteMatch;
  handlers?: HandlerConfig[];
}

const UPSTREAM_TYPES = new Set(["http", "redirect", "service_binding"]);

function getStringOption(
  options: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = options?.[key];
  return typeof value === "string" ? value : undefined;
}

// The handler that determines where a request is ultimately sent. Middleware
// handlers (cors, headers, …) are skipped so the table shows the upstream.
function getUpstreamHandler(
  route: ProxyRouteRecord,
): HandlerConfig | undefined {
  return route.handlers?.find((h) => UPSTREAM_TYPES.has(h.type));
}

interface CustomDomainRecord {
  id?: string;
  custom_domain_id?: string;
}

function useCustomDomainId(): string | undefined {
  const record = useRecordContext<CustomDomainRecord>();
  return record?.custom_domain_id ?? (record?.id as string | undefined);
}

// Rebuild the handlers array, replacing the upstream handler with the form's
// values while preserving any middleware handlers and unmanaged options.
function buildHandlers(
  existing: HandlerConfig[] | undefined,
  upstreamType: UpstreamType,
  upstreamUrl: string,
  preserveHost: boolean,
): HandlerConfig[] {
  const handlers = existing ? [...existing] : [];
  const index = handlers.findIndex((h) => UPSTREAM_TYPES.has(h.type));
  const prevOptions = index >= 0 ? handlers[index].options ?? {} : {};

  const options: Record<string, unknown> = {
    ...prevOptions,
    upstream_url: upstreamUrl,
  };
  if (upstreamType === "http") {
    options.preserve_host = preserveHost;
  } else {
    delete options.preserve_host;
  }

  const handler: HandlerConfig = { type: upstreamType, options };
  if (index >= 0) {
    handlers[index] = handler;
  } else {
    handlers.push(handler);
  }
  return handlers;
}

function isUpstreamType(value: string | undefined): value is UpstreamType {
  return value === "http" || value === "redirect";
}

function ProxyRouteDialog({
  open,
  onOpenChange,
  customDomainId,
  route,
  createPriority,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customDomainId: string;
  route?: ProxyRouteRecord;
  createPriority: number;
  onSaved: () => void;
}) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [submitting, setSubmitting] = useState(false);
  const [pathPattern, setPathPattern] = useState("/*");
  const [upstreamType, setUpstreamType] = useState<UpstreamType>("http");
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [preserveHost, setPreserveHost] = useState(false);

  const isEdit = Boolean(route);

  // Sync form state from the route whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const upstream = route ? getUpstreamHandler(route) : undefined;
    setPathPattern(route?.match?.path ?? "/*");
    setUpstreamType(isUpstreamType(upstream?.type) ? upstream.type : "http");
    setUpstreamUrl(getStringOption(upstream?.options, "upstream_url") ?? "");
    setPreserveHost(upstream?.options?.preserve_host === true);
  }, [open, route]);

  const handleSave = async () => {
    if (!upstreamUrl.trim()) {
      notify("Upstream URL is required", { type: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const handlers = buildHandlers(
        route?.handlers,
        upstreamType,
        upstreamUrl,
        preserveHost,
      );
      const match: RouteMatch = {
        ...(route?.match ?? {}),
        path: pathPattern || "/*",
      };

      if (route) {
        // priority is managed by reordering, so it is left untouched here.
        await dataProvider.update("proxy-routes", {
          id: route.id,
          data: { match, handlers },
          previousData: route,
        });
        notify("Proxy route updated", { type: "success" });
      } else {
        await dataProvider.create("proxy-routes", {
          data: {
            custom_domain_id: customDomainId,
            priority: createPriority,
            match,
            handlers,
          },
        });
        notify("Proxy route added", { type: "success" });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : `Failed to ${isEdit ? "update" : "add"} proxy route`,
        { type: "error" },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit proxy route" : "Add proxy route"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="path-pattern">Path pattern</Label>
            <Input
              id="path-pattern"
              value={pathPattern}
              onChange={(e) => setPathPattern(e.target.value)}
              placeholder="/*, /account/*, /api/*"
            />
            <p className="text-xs text-muted-foreground">
              Exact match, prefix, or <code>/prefix/*</code>. <code>/*</code>{" "}
              matches everything.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="upstream-type">Upstream type</Label>
            <Select
              value={upstreamType}
              onValueChange={(v) => setUpstreamType(v as UpstreamType)}
            >
              <SelectTrigger id="upstream-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {isEdit ? "Save changes" : "Add route"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveRouteButton({
  route,
  disabled,
  onRemoved,
}: {
  route: ProxyRouteRecord;
  disabled?: boolean;
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
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove proxy route</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove the route <strong>{route.match?.path ?? "/*"}</strong> →{" "}
            <strong>
              {getStringOption(getUpstreamHandler(route)?.options, "upstream_url") ??
                "—"}
            </strong>
            ?
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ProxyRouteRecord | undefined>(
    undefined,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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

  // Priorities are spaced out (lower wins) so a route can usually be slotted
  // between its neighbors without renumbering the rest of the list.
  const PRIORITY_GAP = 100;

  // New routes go to the end of the list (largest priority value).
  const nextPriority =
    routes.length > 0
      ? routes[routes.length - 1].priority + PRIORITY_GAP
      : PRIORITY_GAP;

  const openAdd = () => {
    setEditingRoute(undefined);
    setDialogOpen(true);
  };

  const openEdit = (route: ProxyRouteRecord) => {
    setEditingRoute(route);
    setDialogOpen(true);
  };

  // Renumber every route to evenly spaced priorities. Used only when the gap
  // between two neighbors is too small to slot a route between them.
  const rebalance = async (ordered: ProxyRouteRecord[]) => {
    const previousPriority = new Map(routes.map((r) => [r.id, r.priority]));
    const reordered = ordered.map((r, i) => ({
      ...r,
      priority: (i + 1) * PRIORITY_GAP,
    }));
    setRoutes(reordered);
    const changed = reordered.filter(
      (r) => previousPriority.get(r.id) !== r.priority,
    );
    await persistUpdates(changed);
  };

  const persistUpdates = async (changed: ProxyRouteRecord[]) => {
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        changed.map((r) =>
          dataProvider.update("proxy-routes", {
            id: r.id,
            data: { priority: r.priority },
            previousData: r,
          }),
        ),
      );
      notify("Route order updated", { type: "success" });
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to reorder routes",
        { type: "error" },
      );
      refresh();
    } finally {
      setSaving(false);
    }
  };

  // Apply a new ordering by giving the moved route a priority between its new
  // neighbors. Only that one route is patched, unless there's no integer room
  // left between the neighbors, in which case the whole list is renumbered.
  const applyOrder = async (
    ordered: ProxyRouteRecord[],
    movedId: ProxyRouteRecord["id"],
  ) => {
    const index = ordered.findIndex((r) => r.id === movedId);
    const prev = ordered[index - 1];
    const after = ordered[index + 1];

    let priority: number;
    if (!prev && !after) {
      priority = PRIORITY_GAP;
    } else if (!prev) {
      // Moved to the top: halve the gap below the next route.
      priority = Math.floor(after.priority / 2);
      if (priority < 1 || priority >= after.priority) return rebalance(ordered);
    } else if (!after) {
      // Moved to the bottom: leave a full gap above the previous route.
      priority = prev.priority + PRIORITY_GAP;
    } else {
      priority = Math.floor((prev.priority + after.priority) / 2);
      if (priority <= prev.priority || priority >= after.priority) {
        return rebalance(ordered);
      }
    }

    const moved = ordered[index];
    setRoutes(ordered.map((r) => (r.id === movedId ? { ...r, priority } : r)));
    await persistUpdates([{ ...moved, priority }]);
  };

  const move = (index: number, dir: "up" | "down") => {
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= routes.length) return;
    const movedId = routes[index].id;
    const next = [...routes];
    [next[index], next[target]] = [next[target], next[index]];
    applyOrder(next, movedId);
  };

  const handleDrop = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      return;
    }
    const movedId = routes[dragIndex].id;
    const next = [...routes];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setDragIndex(null);
    applyOrder(next, movedId);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-prose">
          <h3 className="text-base font-medium">Proxy routes</h3>
          <p className="text-sm text-muted-foreground">
            Configure how requests to this custom domain are dispatched. Routes
            are matched top to bottom — the first match wins. Drag a route or
            use the arrows to reorder.
          </p>
        </div>
        <Button type="button" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add route
        </Button>
      </div>

      <ProxyRouteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customDomainId={customDomainId}
        route={editingRoute}
        createPriority={nextPriority}
        onSaved={refresh}
      />

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
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Upstream</th>
                <th className="px-3 py-2 font-medium">Host</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => {
                const upstream = getUpstreamHandler(r);
                const upstreamUrl = getStringOption(
                  upstream?.options,
                  "upstream_url",
                );
                const preserveHost = upstream?.options?.preserve_host === true;
                return (
                  <tr
                    key={r.id}
                    draggable={!saving}
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => setDragIndex(null)}
                    className={`border-t cursor-pointer hover:bg-muted/30 ${
                      dragIndex === i ? "opacity-50" : ""
                    }`}
                    onClick={() => openEdit(r)}
                  >
                    <td
                      className="px-3 py-2 text-muted-foreground cursor-grab active:cursor-grabbing"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.match?.path ?? "/*"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{upstream?.type ?? "—"}</Badge>
                    </td>
                    <td className="px-3 py-2 break-all">{upstreamUrl ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {upstream?.type === "http"
                        ? preserveHost
                          ? "preserve"
                          : "rewrite"
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move up"
                          disabled={i === 0 || saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            move(i, "up");
                          }}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move down"
                          disabled={i === routes.length - 1 || saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            move(i, "down");
                          }}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <RemoveRouteButton
                          route={r}
                          disabled={saving}
                          onRemoved={refresh}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
