import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromCookie } from "./utils/domainUtils";

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const isAuthCallback = window.location.pathname === "/auth-callback";
  const isRootPath = window.location.pathname === "/";

  // Load domain from cookies on component mount
  useEffect(() => {
    const savedDomain = getSelectedDomainFromCookie();
    if (savedDomain) {
      setSelectedDomain(savedDomain);
    }
  }, []);

  // If we're on the auth callback route, bypass domain selection
  // and render the callback component directly
  if (isAuthCallback && selectedDomain) {
    return (
      <React.StrictMode>
        <TenantsApp initialDomain={selectedDomain} />
      </React.StrictMode>
    );
  }

  // Only show the domain selector if:
  // 1. No domain is selected yet, AND
  // 2. We're on the root path OR we don't have a saved domain in cookies
  if (!selectedDomain && isRootPath) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
      />
    );
  }

  // If we reached this point and still don't have a selected domain,
  // we should show the domain selector instead of proceeding with a null domain
  if (!selectedDomain) {
    return (
      <DomainSelector
        onDomainSelected={(domain) => setSelectedDomain(domain)}
      />
    );
  }

  return (
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/auth-callback" element={<AuthCallback />} />
          <Route
            path="/tenants/*"
            element={<TenantsApp initialDomain={selectedDomain} />}
          />
          <Route
            path="/:tenantId/*"
            element={<AppWrapper selectedDomain={selectedDomain} />}
          />
          <Route
            path="/*"
            element={<TenantsApp initialDomain={selectedDomain} />}
          />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}

// Component to handle the tenant ID from the URL
function AppWrapper({ selectedDomain }: { selectedDomain: string }) {
  const pathname = window.location.pathname;
  const pathSegments = pathname.split("/").filter(Boolean);
  const tenantId = pathSegments[0] || "";

  if (!tenantId) {
    return null;
  }

  // Use the App component with tenantId but without creating a new router
  // The existing router context from the parent will be used
  return <App tenantId={tenantId} initialDomain={selectedDomain} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
