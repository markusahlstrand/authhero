import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";
import {
  getConfigValue,
  getBasePath,
  applyBranding,
} from "./utils/runtimeConfig";
import "./styles/globals.css";

applyBranding();

const envDomain = getConfigValue("domain");

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    envDomain || getSelectedDomainFromStorage() || null,
  );
  const basePath = getBasePath();
  const currentPath = location.pathname;
  const relativePath =
    basePath && currentPath.startsWith(basePath)
      ? currentPath.slice(basePath.length) || "/"
      : currentPath;
  const isAuthCallback = relativePath === "/auth-callback";
  const isRootPath = relativePath === "/";
  const isTenantsPath =
    relativePath === "/tenants" ||
    relativePath.startsWith("/tenants/create") ||
    relativePath === "/tenants/" ||
    // Control-plane subpages registered as CustomRoutes inside TenantsApp —
    // without these, a full page load of their URLs would fall through to
    // the per-tenant app branch with tenantId="tenants".
    /^\/tenants\/[^/]+\/(members|operations)(\/|$)/.test(relativePath);

  if (isAuthCallback) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={basePath || undefined}>
          <AuthCallback onAuthComplete={() => {}} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  if (!selectedDomain) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
        disableCloseOnRootPath={isRootPath}
      />
    );
  }

  if (envDomain && isRootPath) {
    window.location.href = basePath + "/tenants";
    return null;
  }

  if (isTenantsPath) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={basePath || undefined}>
          <TenantsApp initialDomain={selectedDomain || ""} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

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

  return (
    <DomainSelector
      onDomainSelected={(domain) => setSelectedDomain(domain)}
      disableCloseOnRootPath={false}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
