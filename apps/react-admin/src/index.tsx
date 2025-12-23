import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";

// Check if running on local.authhero.net - if so, auto-connect to localhost:3000
const isLocalDevelopment = window.location.hostname.startsWith("local.");
const LOCAL_DOMAIN = "localhost:3000";

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    isLocalDevelopment ? LOCAL_DOMAIN : null,
  );
  const currentPath = location.pathname;
  const isAuthCallback = currentPath === "/auth-callback";
  const isRootPath = currentPath === "/";
  // Only match /tenants exactly or /tenants/create (not /tenants/:id which would be a tenant admin route)
  const isTenantsPath =
    currentPath === "/tenants" ||
    currentPath.startsWith("/tenants/create") ||
    currentPath === "/tenants/";

  // Load domain from cookies on component mount (skip for local development)
  useEffect(() => {
    if (isLocalDevelopment) {
      // For local development, always use localhost:3000
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

  // Show domain selector on root path or if no domain is selected
  // Skip for local development - redirect to /tenants instead
  if (!isLocalDevelopment && (isRootPath || !selectedDomain)) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
        disableCloseOnRootPath={isRootPath}
      />
    );
  }

  // For local development on root path, redirect to /tenants
  if (isLocalDevelopment && isRootPath) {
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

  // Fallback to domain selector (or redirect for local development)
  if (isLocalDevelopment) {
    window.location.href = "/tenants";
    return null;
  }

  return (
    <DomainSelector
      onDomainSelected={(domain) => setSelectedDomain(domain)}
      disableCloseOnRootPath={false}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
