import { createElement } from "react";
import {
  useCanAccess,
  useCreatePath,
  useGetResourceLabel,
  useHasDashboard,
  useResourceDefinitions,
  useTranslate,
} from "ra-core";
import { Link, useMatch } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { House, List, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getSelectedDomainFromStorage } from "@/utils/domainUtils";

/**
 * AuthHero admin sidebar.
 *
 * Pure navigation — the AuthHero brand lives in the top bar (grouped with
 * the tenant switcher), not in the sidebar header.
 *
 * Resources are grouped by `options.menuGroup` (Identity / Applications /
 * Branding / Developer / Security / Observability / Settings). Resources
 * without a configured group fall through into a final "More" section, so
 * adding a new <Resource> still surfaces it even without a group set.
 * Group order is fixed by MENU_GROUPS — alphabetical would scatter
 * the IAM resources (Users, Roles, Organizations) across the list.
 *
 * Dashboard always renders at the top, ungrouped, since it's a top-level
 * landing page rather than a resource.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/appsidebar}
 */

// Order matters — this is the visual order in the sidebar. Empty groups
// (no resources assigned) collapse silently.
const MENU_GROUPS = [
  "Identity",
  "Applications",
  "Branding",
  "Developer",
  "Security",
  "Observability",
  "Settings",
] as const;

const FALLBACK_GROUP = "More";

type ResourceOptions = {
  label?: string;
  menuGroup?: string;
  hasSingle?: boolean;
};

export function AppSidebar() {
  const hasDashboard = useHasDashboard();
  const resources = useResourceDefinitions();
  const { openMobile, setOpenMobile, toggleSidebar, state } = useSidebar();
  const handleClick = () => {
    if (openMobile) setOpenMobile(false);
  };

  // Bucket resources by group, preserving registration order within a group.
  const grouped = new Map<string, string[]>();
  const listable = Object.keys(resources).filter((n) => resources[n].hasList);
  for (const name of listable) {
    const opts = resources[name].options as ResourceOptions | undefined;
    const group = opts?.menuGroup ?? FALLBACK_GROUP;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(name);
  }

  // Render in MENU_GROUPS order, then anything in FALLBACK_GROUP last.
  const orderedGroups: string[] = [
    ...MENU_GROUPS.filter((g) => grouped.has(g)),
    ...(grouped.has(FALLBACK_GROUP) ? [FALLBACK_GROUP] : []),
  ];

  // Display the auth endpoint (selected domain) in the footer. Falls back to
  // a placeholder so the footer keeps its shape when storage is empty.
  const authEndpoint = (() => {
    const d = getSelectedDomainFromStorage();
    if (!d) return "no domain";
    try {
      return new URL(d.includes("://") ? d : `https://${d}`).host;
    } catch {
      return d;
    }
  })();

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      // Push the sidebar below the topbar (h-14 = 3.5rem). Without this the
      // shadcn `fixed inset-y-0` container would span the full viewport and
      // sit in front of the topbar's left side.
      className="top-14 !h-[calc(100svh-3.5rem)]"
    >
      <SidebarContent>
        {/* Dashboard always first, no group label */}
        {hasDashboard && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <DashboardMenuItem onClick={handleClick} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {orderedGroups.map((groupName) => {
          const names = grouped.get(groupName) ?? [];
          if (names.length === 0) return null;

          return (
            <SidebarGroup key={groupName}>
              <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {names.map((name) => (
                    <ResourceMenuItem
                      key={name}
                      name={name}
                      onClick={handleClick}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {/* Footer: API status indicator (left) + collapse button (right).
         Status shows which auth domain the admin is talking to — a useful
         at-a-glance check for ops. Top border separates it from the nav
         above. Hides domain text in collapsed mode. */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-1 px-1">
          <div
            className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground min-w-0 group-data-[collapsible=icon]:hidden"
            title={authEndpoint}
          >
            <span
              className="size-1.5 rounded-full bg-emerald-500 shrink-0"
              aria-hidden="true"
            />
            <span className="truncate tabular-nums">{authEndpoint}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="size-7 ml-auto"
            aria-label={
              state === "expanded" ? "Collapse sidebar" : "Expand sidebar"
            }
            title={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
          >
            {state === "expanded" ? (
              <PanelLeftClose className="size-3.5" />
            ) : (
              <PanelLeftOpen className="size-3.5" />
            )}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export const DashboardMenuItem = ({ onClick }: { onClick?: () => void }) => {
  const translate = useTranslate();
  const label = translate("ra.page.dashboard", { _: "Dashboard" });
  const match = useMatch({ path: "/", end: true });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to="/" onClick={onClick}>
          <House />
          {label}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export const ResourceMenuItem = ({
  name,
  onClick,
}: {
  name: string;
  onClick?: () => void;
}) => {
  const { canAccess, isPending } = useCanAccess({
    resource: name,
    action: "list",
  });
  const resources = useResourceDefinitions();
  const getResourceLabel = useGetResourceLabel();
  const createPath = useCreatePath();
  const to = createPath({ resource: name, type: "list" });
  const match = useMatch({ path: to, end: false });

  if (isPending) {
    return <Skeleton className="h-8 w-full" />;
  }
  if (!resources || !resources[name] || !canAccess) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!match}>
        <Link to={to} state={{ _scrollToTop: true }} onClick={onClick}>
          {resources[name].icon ? (
            createElement(resources[name].icon)
          ) : (
            <List />
          )}
          {getResourceLabel(name, 2)}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
