import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";

// If a domain is configured via env, use single-domain mode automatically
const envDomain = import.meta.env.VITE_AUTH0_DOMAIN;

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    envDomain || null,
  );
  const currentPath = location.pathname;
  const isAuthCallback = currentPath === "/auth-callback";
  const isRootPath = currentPath === "/";
  // Only match /tenants exactly or /tenants/create (not /tenants/:id which would be a tenant admin route)
  const isTenantsPath =
    currentPath === "/tenants" ||
    currentPath.startsWith("/tenants/create") ||
    currentPath === "/tenants/";

  // Load domain from cookies on component mount (only when no env domain configured)
  useEffect(() => {
    if (envDomain) {
      return;
    }
    const savedDomain = getSelectedDomainFromStorage();
    if (savedDomain) {
      setSelectedDomain(savedDomain);
    }
  }, []);

  // Handle auth callback separately without basename
  if (isAuthCallback) {
    return (
      <React.StrictMode>
        <BrowserRouter>
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
    window.location.href = "/tenants";
    return null;
  }

  // Handle tenants management routes without basename
  if (isTenantsPath) {
    return (
      <React.StrictMode>
        <BrowserRouter>
          <TenantsApp initialDomain={selectedDomain || ""} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  // Handle tenant-specific routes
  const pathSegments = currentPath.split("/").filter(Boolean);
  const tenantId = pathSegments[0];

  if (tenantId) {
    return (
      <React.StrictMode>
        <BrowserRouter basename={`/${tenantId}`}>
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
