import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTenantId } from "@/TenantContext";
import { createAuth0Client } from "@/authProvider";
import { resolveApiBase } from "@/dataProvider";
import { getBasePath } from "@/utils/runtimeConfig";
import {
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import getToken from "@/utils/tokenUtils";

/**
 * Tenant switcher pill in the top bar.
 *
 * Tenants are fetched lazily on first open using the same Auth0 token +
 * domain that TenantsApp uses. We bypass the tenant-scoped dataProvider
 * here because it targets `/api/v2/{tenantId}/...` and would 404 on the
 * global tenants endpoint.
 *
 * Switching tenants does a full reload to /{basePath}/{tenantId} since the
 * dataProvider closure captures tenantId at mount.
 */

type Tenant = { id: string; name?: string };

const SEARCH_THRESHOLD = 5;
const PAGE_SIZE = 100;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function TenantSwitcher() {
  const tenantId = useTenantId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 200);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const domain = getSelectedDomainFromStorage();
        const apiUrl = resolveApiBase(domain);
        const formatted = formatDomain(domain);
        const domainConfig = getDomainFromStorage().find(
          (d) => formatDomain(d.url) === formatted,
        );
        if (!domainConfig) throw new Error("No domain configuration found");
        const auth0 =
          domainConfig.connectionMethod === "login"
            ? createAuth0Client(domain)
            : undefined;
        // Bypass the Auth0 SDK token cache (which is keyed on
        // clientId+audience+scope and would return the org-scoped token left
        // over from the current tenant page). getToken routes OAuth login
        // through getNonOrgAccessToken so the tenants list isn't filtered to
        // a single org.
        const token = await getToken(domainConfig, auth0);
        const params = new URLSearchParams({
          per_page: String(PAGE_SIZE),
          include_totals: "true",
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        const res = await fetch(
          `${apiUrl}/api/v2/tenants?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (cancelled) return;
        const list: Tenant[] = Array.isArray(data)
          ? (data as Tenant[])
          : isTenantsEnvelope(data)
            ? data.tenants
            : [];
        setTenants(list);
        setError(null);
        if (
          !Array.isArray(data) &&
          isTenantsEnvelope(data) &&
          typeof data.length === "number" &&
          // Only update the total when there's no active search; otherwise we'd
          // overwrite the unfiltered total with the filtered result count and
          // hide the search input on the next open.
          !debouncedSearch
        ) {
          setTotal(data.length);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load tenants");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const showSearch =
    (total ?? tenants?.length ?? 0) > SEARCH_THRESHOLD || search.length > 0;

  const current = tenants?.find((t) => t.id === tenantId);
  const label = current?.name ?? tenantId ?? "Select tenant";
  const initial = (current?.name ?? tenantId ?? "?").charAt(0).toUpperCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 gap-2 pl-2 pr-2 font-medium"
        >
          <span className="flex size-5 items-center justify-center rounded-sm bg-primary text-primary-foreground text-[10px] font-bold">
            {initial}
          </span>
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          {showSearch && (
            <CommandInput
              placeholder="Search tenants…"
              value={search}
              onValueChange={setSearch}
            />
          )}
          <CommandList>
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {error && (
              <div className="py-6 text-center text-sm text-destructive">
                {error}
              </div>
            )}
            {!loading && !error && (
              <>
                <CommandEmpty>No tenants found.</CommandEmpty>
                <CommandGroup heading="Tenants">
                  {(tenants ?? []).map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`${t.name ?? ""} ${t.id}`}
                      onSelect={() => {
                        setOpen(false);
                        if (t.id !== tenantId) {
                          window.location.href = `${getBasePath()}/${t.id}`;
                        }
                      }}
                    >
                      <span className="flex size-5 items-center justify-center rounded-sm bg-muted text-muted-foreground text-[10px] font-bold mr-2">
                        {(t.name ?? t.id).charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">
                          {t.name ?? t.id}
                        </div>
                        {t.name && (
                          <div className="truncate text-xs text-muted-foreground">
                            {t.id}
                          </div>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "size-4 ml-auto",
                          t.id === tenantId ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  navigate(`${getBasePath()}/tenants`);
                }}
              >
                <Plus className="size-4 mr-2" />
                Manage tenants
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function isTenantsEnvelope(
  v: unknown,
): v is { tenants: Tenant[]; length?: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    "tenants" in v &&
    Array.isArray((v as { tenants: unknown }).tenants)
  );
}
