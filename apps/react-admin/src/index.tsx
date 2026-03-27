import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";
import { getConfigValue, getBasePath } from "./utils/runtimeConfig";

// If a domain is configured via env/runtime, use single-domain mode automatically
const envDomain = getConfigValue("domain");

function Root() {
  // Initialize synchronously from storage to prevent flash of DomainSelector on direct navigation
  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    envDomain || getSelectedDomainFromStorage() || null,
  );
  const basePath = getBasePath();
  const currentPath = location.pathname;
  // Strip base path prefix to get the relative path for routing decisions
  const relativePath =
    basePath && currentPath.startsWith(basePath)
      ? currentPath.slice(basePath.length) || "/"
      : currentPath;
  const isAuthCallback = relativePath === "/auth-callback";
  const isRootPath = relativePath === "/";
  // Only match /tenants exactly or /tenants/create (not /tenants/:id which would be a tenant admin route)
  const isTenantsPath =
    relativePath === "/tenants" ||
    relativePath.startsWith("/tenants/create") ||
    relativePath === "/tenants/";

  // Handle auth callback separately without basename
  if (isAuthCallback) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={basePath || undefined}>
          <AuthCallback onAuthComplete={() => {}} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  // Show domain selector only if no domain is selected
  if (!selectedDomain) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
        disableCloseOnRootPath={isRootPath}
      />
    );
  }

  // For env-configured domain on root path, redirect to /tenants
  if (envDomain && isRootPath) {
    window.location.href = basePath + "/tenants";
    return null;
  }

  // Handle tenants management routes without basename
  if (isTenantsPath) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={basePath || undefined}>
          <TenantsApp initialDomain={selectedDomain || ""} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  // Handle tenant-specific routes
  const pathSegments = relativePath.split("/").filter(Boolean);
  const tenantId = pathSegments[0];

  if (tenantId) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={`${basePath}/${tenantId}`}>
          <App tenantId={tenantId} initialDomain={selectedDomain || ""} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  // Fallback to domain selector
  return (
    <DomainSelector
      onDomainSelected={(domain) => setSelectedDomain(domain)}
      disableCloseOnRootPath={false}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
