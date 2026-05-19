import type { ErrorInfo } from "react";
import { Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import type { CoreLayoutProps } from "ra-core";
import { ErrorBoundary } from "react-error-boundary";
import { Link } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/admin/user-menu";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { Notification } from "@/components/admin/notification";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { RefreshButton } from "@/components/admin/refresh-button";
import { LocalesMenuButton } from "@/components/admin/locales-menu-button";
import { Error } from "@/components/admin/error";
import { Loading } from "@/components/admin/loading";
import { TenantSwitcher } from "@/components/admin/tenant-switcher";
import { GlobalSearch } from "@/components/admin/global-search";
import { getAppName, getConfigValue } from "@/utils/runtimeConfig";

/**
 * AuthHero admin layout.
 *
 * Full-width top bar across both columns; sidebar + main row sits below.
 * Brand (AuthHero) lives in the top bar next to the tenant switcher so
 * the sidebar can be purely navigation. The breadcrumb portal target
 * (`<div id="breadcrumb" />`) is preserved — `<Breadcrumb>` from
 * @/components/admin still works unchanged.
 */
export const Layout = (props: CoreLayoutProps) => {
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | undefined>(undefined);
  const handleError = (_: unknown, info: ErrorInfo) => {
    setErrorInfo(info);
  };
  const appName = getAppName();
  const logoUrl = getConfigValue("logoUrl");
  const initials = appName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <SidebarProvider>
      <div className="flex h-svh w-full flex-col">
        {/* ============= TOP BAR (full-width) ============= */}
        <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
          {/* Brand: configured logo if provided, otherwise wordmark/glyph. */}
          <Link
            to="/"
            className="flex items-center gap-2 px-1 hover:opacity-80 transition-opacity"
            aria-label={`${appName} — Dashboard`}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={appName}
                className="h-7 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <>
                <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground text-[11px] font-bold tracking-tight sm:hidden">
                  {initials || "AH"}
                </span>
                <span className="hidden sm:inline text-base font-bold tracking-tight">
                  {appName}
                </span>
              </>
            )}
          </Link>

          <span
            aria-hidden="true"
            className="text-border text-lg font-light select-none"
          >
            /
          </span>

          <TenantSwitcher />

          {/* Breadcrumb portal — sits next to the tenant switcher as part
              of the navigation context. flex-1 pushes utilities right. */}
          <div
            className="flex-1 flex items-center min-w-0 gap-2"
            id="breadcrumb"
          />

          {/* Right side utilities */}
          <div className="flex items-center gap-1.5">
            <GlobalSearch />
            <LocalesMenuButton />
            <ThemeModeToggle />
            <RefreshButton />
            <UserMenu />
          </div>
        </header>

        {/* ============= SIDEBAR + MAIN ROW ============= */}
        <div className="flex flex-1 min-h-0">
          <AppSidebar />
          <main
            className={cn(
              "ml-auto w-full max-w-full",
              "peer-data-[state=collapsed]:w-[calc(100%-var(--sidebar-width-icon)-1rem)]",
              "peer-data-[state=expanded]:w-[calc(100%-var(--sidebar-width))]",
              "sm:transition-[width] sm:duration-200 sm:ease-linear",
              "flex flex-col",
              "overflow-auto",
            )}
          >
            <ErrorBoundary
              onError={handleError}
              fallbackRender={({ error, resetErrorBoundary }) => (
                <Error
                  error={error}
                  errorInfo={errorInfo}
                  resetErrorBoundary={resetErrorBoundary}
                />
              )}
            >
              <Suspense fallback={<Loading />}>
                <div className="flex flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8">
                  {props.children}
                </div>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Notification />
    </SidebarProvider>
  );
};
