import {
  createElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  type RaRecord,
  useCreatePath,
  useGetList,
  useGetResourceLabel,
  useResourceDefinitions,
} from "ra-core";
import {
  Search,
  Plus,
  List as ListIcon,
  Loader2,
  Users,
  Database,
  Cloud,
  UserCog,
  Shield,
  Activity,
  Code,
  Webhook,
  Layout,
  Workflow,
  Layers,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

/**
 * Global ⌘K command palette.
 *
 * Two modes:
 *  - Navigation/create: lists every resource that has a list/create view
 *    so the palette doubles as a jump-to-page menu.
 *  - Record search: when the user types ≥2 chars, fires parallel
 *    dataProvider.getList calls against every searchable resource and
 *    surfaces matching records, grouped by resource. cmdk's built-in
 *    filtering is disabled (`shouldFilter={false}`) so server results
 *    aren't double-filtered out.
 */

type HitConfig = {
  primary: (record: RaRecord) => string;
  secondary?: (record: RaRecord) => string | undefined;
  icon: typeof Users;
};

// Resources to query for record search. Singletons (branding, settings,
// prompts, attack-protection, email-providers) and config-only resources
// (signing-keys, action-triggers, logs) are intentionally excluded.
const SEARCHABLE: Record<string, HitConfig> = {
  users: {
    primary: (r) => str(r.email) || str(r.name) || str(r.user_id) || str(r.id),
    secondary: (r) => {
      const email = str(r.email);
      const name = str(r.name);
      return name && email && name !== email ? name : undefined;
    },
    icon: Users,
  },
  clients: {
    primary: (r) => str(r.name) || str(r.client_id) || str(r.id),
    secondary: (r) => str(r.client_id),
    icon: Database,
  },
  connections: {
    primary: (r) => str(r.name) || str(r.id),
    secondary: (r) => str(r.strategy),
    icon: Cloud,
  },
  organizations: {
    primary: (r) => str(r.display_name) || str(r.name) || str(r.id),
    secondary: (r) => {
      const name = str(r.name);
      const display = str(r.display_name);
      return name && name !== display ? name : undefined;
    },
    icon: UserCog,
  },
  roles: {
    primary: (r) => str(r.name) || str(r.id),
    secondary: (r) => str(r.description),
    icon: Shield,
  },
  "resource-servers": {
    primary: (r) => str(r.name) || str(r.identifier) || str(r.id),
    secondary: (r) => str(r.identifier),
    icon: Activity,
  },
  actions: {
    primary: (r) => str(r.name) || str(r.id),
    icon: Code,
  },
  hooks: {
    primary: (r) => str(r.name) || str(r.id),
    secondary: (r) => str(r.triggerId),
    icon: Webhook,
  },
  forms: {
    primary: (r) => str(r.name) || str(r.id),
    icon: Layout,
  },
  flows: {
    primary: (r) => str(r.name) || str(r.id),
    icon: Workflow,
  },
  "custom-domains": {
    primary: (r) => str(r.domain) || str(r.id),
    secondary: (r) => str(r.status),
    icon: Layers,
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 200);
  const navigate = useNavigate();
  const resources = useResourceDefinitions();
  const getResourceLabel = useGetResourceLabel();
  const createPath = useCreatePath();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset input when the dialog closes so a fresh open starts blank.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const navItems = useMemo(
    () => Object.values(resources).filter((r) => r.hasList),
    [resources],
  );
  const createItems = useMemo(
    () =>
      Object.values(resources).filter(
        (r) => r.hasCreate && !r.options?.hasSingle,
      ),
    [resources],
  );

  const hasQuery = debouncedQuery.length >= 2;
  const lowerQuery = debouncedQuery.toLowerCase();

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // Build the filtered nav/create lists ourselves since cmdk filtering is off.
  const filterByLabel = <T extends { name: string }>(items: T[]) =>
    !hasQuery
      ? items
      : items.filter((r) => {
          const label = getResourceLabel(r.name, 2).toLowerCase();
          return (
            label.includes(lowerQuery) ||
            r.name.toLowerCase().includes(lowerQuery)
          );
        });

  const visibleNav = filterByLabel(navItems);
  const visibleCreate = filterByLabel(createItems);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 px-2 text-muted-foreground font-normal min-w-[200px] justify-start"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Search users, applications, connections…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {hasQuery ? "No results found." : "Type to search…"}
          </CommandEmpty>

          {hasQuery &&
            Object.entries(SEARCHABLE).map(([resource, config]) => (
              <ResourceHits
                key={resource}
                resource={resource}
                query={debouncedQuery}
                config={config}
                onSelect={(record) =>
                  go(createPath({ resource, id: record.id, type: "edit" }))
                }
                resourceLabel={getResourceLabel(resource, 2)}
              />
            ))}

          {visibleNav.length > 0 && (
            <>
              {hasQuery && <CommandSeparator />}
              <CommandGroup heading="Go to">
                {visibleNav.map((r) => (
                  <CommandItem
                    key={`nav-${r.name}`}
                    value={`go-${r.name}`}
                    onSelect={() =>
                      go(createPath({ resource: r.name, type: "list" }))
                    }
                  >
                    {r.icon ? createElement(r.icon) : <ListIcon />}
                    <span>{getResourceLabel(r.name, 2)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {visibleCreate.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Create">
                {visibleCreate.map((r) => (
                  <CommandItem
                    key={`create-${r.name}`}
                    value={`new-${r.name}`}
                    onSelect={() =>
                      go(createPath({ resource: r.name, type: "create" }))
                    }
                  >
                    <Plus />
                    <span>New {getResourceLabel(r.name, 1)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

/**
 * One resource's slice of the search results. Fires its own useGetList so
 * react-query parallelises the fetches across resources, and a slow/failed
 * resource doesn't block the rest from rendering.
 */
function ResourceHits({
  resource,
  query,
  config,
  onSelect,
  resourceLabel,
}: {
  resource: string;
  query: string;
  config: HitConfig;
  onSelect: (record: RaRecord) => void;
  resourceLabel: string;
}): ReactNode {
  const { data, isFetching, error } = useGetList(
    resource,
    {
      pagination: { page: 1, perPage: 5 },
      sort: { field: "id", order: "ASC" },
      filter: { q: query },
    },
    {
      enabled: query.length >= 2,
      retry: false,
      // Keep prior results visible while typing the next character.
      placeholderData: (prev) => prev,
    },
  );

  // Some resources don't honour `q` server-side (or via the dataProvider's
  // client-side filter). Fall back to filtering the returned page by the
  // primary/secondary fields so the user still sees the obvious matches.
  const filtered = useMemo(() => {
    if (!data || data.length === 0) return [];
    const q = query.toLowerCase();
    return data.filter((record) => {
      const fields = [config.primary(record), config.secondary?.(record)]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .map((v) => v.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [data, query, config]);

  if (error || (!isFetching && filtered.length === 0)) return null;

  const Icon = config.icon;

  return (
    <CommandGroup
      heading={
        <span className="flex items-center gap-2">
          {resourceLabel}
          {isFetching && <Loader2 className="size-3 animate-spin" />}
        </span>
      }
    >
      {filtered.map((record) => {
        const primary = config.primary(record);
        const secondary = config.secondary?.(record);
        return (
          <CommandItem
            key={`${resource}-${record.id}`}
            value={`${resource}-${record.id}`}
            onSelect={() => onSelect(record)}
          >
            <Icon />
            <span className="flex-1 truncate">{primary}</span>
            {secondary && (
              <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                {secondary}
              </span>
            )}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
