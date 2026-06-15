export interface AdminConfig {
  domain?: string;
  clientId?: string;
  apiUrl?: string;
  audience?: string;
  basePath?: string;
  appName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  /** "true" to call tenant-scoped management APIs on `{tenant_id}.{apiHost}` */
  useTenantSubdomains?: string;
}

declare global {
  interface Window {
    __AUTHHERO_ADMIN_CONFIG__?: AdminConfig;
  }
}

const envMap: Record<keyof AdminConfig, string> = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || "",
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || "",
  apiUrl: import.meta.env.VITE_AUTH0_API_URL || "",
  audience: import.meta.env.VITE_AUTH0_AUDIENCE || "",
  basePath: import.meta.env.VITE_BASE_PATH || "",
  appName: import.meta.env.VITE_APP_NAME || "",
  logoUrl: import.meta.env.VITE_APP_LOGO_URL || "",
  faviconUrl: import.meta.env.VITE_APP_FAVICON_URL || "",
  useTenantSubdomains: import.meta.env.VITE_USE_TENANT_SUBDOMAINS || "",
};

export function getConfigValue(key: keyof AdminConfig): string {
  const runtime = window.__AUTHHERO_ADMIN_CONFIG__;
  return (runtime?.[key] as string) ?? envMap[key];
}

export function getBasePath(): string {
  const bp = getConfigValue("basePath");
  if (!bp || bp === "/") return "";
  const normalized = bp.startsWith("/") ? bp : `/${bp}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export const DEFAULT_APP_NAME = "AuthHero Admin";

export function getAppName(): string {
  return getConfigValue("appName") || DEFAULT_APP_NAME;
}

export function applyBranding(): void {
  if (typeof document === "undefined") return;
  document.title = getAppName();
  const faviconUrl = getConfigValue("faviconUrl");
  if (!faviconUrl) return;
  let link = document.getElementById("app-favicon") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "app-favicon";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = faviconUrl;
  link.removeAttribute("type");
}
