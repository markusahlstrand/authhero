import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const currentPath = location.pathname;
  const isAuthCallback = currentPath === "/auth-callback";
  const isRootPath = currentPath === "/";
  const isTenantsPath = currentPath.startsWith("/tenants");

  // Load domain from cookies on component mount
  useEffect(() => {
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
  if (isRootPath || !selectedDomain) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
        disableCloseOnRootPath={isRootPath}
      />
    );
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
