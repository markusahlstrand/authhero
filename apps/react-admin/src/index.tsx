import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";
import { AuthCallback } from "./AuthCallback";
import { DomainSelector } from "./components/DomainSelector";
import { getSelectedDomainFromCookie } from "./utils/domainUtils";

function Root() {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const authFlowInProgressRef = useRef<boolean>(false);
  const isAuthCallback = window.location.pathname === "/auth-callback";
  const isRootPath = window.location.pathname === "/";

  // Load domain from cookies on component mount
  useEffect(() => {
    const savedDomain = getSelectedDomainFromCookie();
    if (savedDomain) {
      setSelectedDomain(savedDomain);
    }
  }, []);

  // If we're on the auth callback route, we need to make sure the AuthCallback component handles it
  if (isAuthCallback) {
    // Ensure we're using BrowserRouter for the callback
    return (
      <React.StrictMode>
        <BrowserRouter>
          <AuthCallback
            onAuthComplete={() => {
              authFlowInProgressRef.current = false;
            }}
          />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  // Always show the domain selector when on the root path,
  // regardless of whether a domain has been previously selected
  if (isRootPath) {
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
          <Route
            path="/tenants/*"
            element={
              <TenantsApp
                initialDomain={selectedDomain}
                onAuthComplete={() => {
                  authFlowInProgressRef.current = false;
                }}
              />
            }
          />
          <Route
            path="/:tenantId/*"
            element={
              <AppWrapper
                selectedDomain={selectedDomain}
                onAuthComplete={() => {
                  authFlowInProgressRef.current = false;
                }}
              />
            }
          />
          <Route
            path="/*"
            element={
              <TenantsApp
                initialDomain={selectedDomain}
                onAuthComplete={() => {
                  authFlowInProgressRef.current = false;
                }}
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}

// Component to handle the tenant ID from the URL
function AppWrapper({
  selectedDomain,
  onAuthComplete,
}: {
  selectedDomain: string;
  onAuthComplete: () => void;
}) {
  const pathname = window.location.pathname;
  const pathSegments = pathname.split("/").filter(Boolean);
  const tenantId = pathSegments[0] || "";

  if (!tenantId) {
    return null;
  }

  // Use the App component with tenantId but without creating a new router
  // The existing router context from the parent will be used
  return (
    <App
      tenantId={tenantId}
      initialDomain={selectedDomain}
      onAuthComplete={onAuthComplete}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
