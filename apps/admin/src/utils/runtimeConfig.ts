export interface AdminConfig {
  domain?: string;
  clientId?: string;
  apiUrl?: string;
  audience?: string;
  basePath?: string;
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
