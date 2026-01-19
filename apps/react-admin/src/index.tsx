import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";

// Check if single domain mode is enabled - skips the domain selector entirely
const isSingleDomainMode = import.meta.env.VITE_SINGLE_DOMAIN_MODE === "true";
const envDomain = import.meta.env.VITE_AUTH0_DOMAIN;

function Root() {
  // In single domain mode or when env domain is configured, use the configured domain
  const getInitialDomain = () => {
    if (isSingleDomainMode && envDomain) {
      return envDomain;
    }
    // If environment domain is configured (but not single domain mode), use it
    if (envDomain) {
      return envDomain;
    }
    return null;
  };

  const [selectedDomain, setSelectedDomain] = useState<string | null>(
    getInitialDomain(),
  );
  const currentPath = location.pathname;
  const isAuthCallback = currentPath === "/auth-callback";
  const isRootPath = currentPath === "/";
  // Only match /tenants exactly or /tenants/create (not /tenants/:id which would be a tenant admin route)
  const isTenantsPath =
    currentPath === "/tenants" ||
    currentPath.startsWith("/tenants/create") ||
    currentPath === "/tenants/";

  // Load domain from cookies on component mount (skip for single domain mode)
  useEffect(() => {
    if (isSingleDomainMode) {
      // For single domain mode, always use the configured domain
      return;
    }
    const savedDomain = getSelectedDomainFromStorage();
    if (savedDomain) {
      setSelectedDomain(savedDomain);
    } else if (envDomain) {
      // If no saved domain but env domain is set, use it and save it
      setSelectedDomain(envDomain);
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
  // Skip for single domain mode and when env domain is configured
  if (!isSingleDomainMode && !selectedDomain) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
        disableCloseOnRootPath={isRootPath}
      />
    );
  }

  // For single domain mode on root path, redirect to /tenants
  if (isSingleDomainMode && isRootPath) {
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
