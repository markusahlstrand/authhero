import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CircularProgress, Box, Typography, Alert } from "@mui/material";
import { getSelectedDomainFromStorage } from "./utils/domainUtils";
import { createAuth0Client, createAuth0ClientForOrg } from "./authProvider";

interface AuthCallbackProps {
  onAuthComplete?: () => void;
}

export function AuthCallback({ onAuthComplete }: AuthCallbackProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const callbackProcessedRef = useRef(false);
  const navigationAttemptedRef = useRef(false);

  // Helper function to ensure navigation happens and prevent infinite loops
  const forceNavigate = (path: string) => {
    if (!navigationAttemptedRef.current) {
      navigationAttemptedRef.current = true;

      // Signal that auth flow is complete before navigation
      if (onAuthComplete) onAuthComplete();

      // Use window.location for a hard redirect instead of React Router's navigate
      // This ensures we get a clean page load without any state issues
      window.location.href = path;
    }
  };

  useEffect(() => {
    const handleCallback = async () => {
      // Skip if we've already processed this callback
      if (callbackProcessedRef.current) {
        return;
      }

      try {
        // Get the currently selected domain from cookies
        const selectedDomain = getSelectedDomainFromStorage();

        if (!selectedDomain) {
          // If no domain is selected, redirect to the home page to select one
          forceNavigate("/");
          return;
        }

        // Check if we have the required query parameters
        const hasAuthParams =
          location.search.includes("code=") &&
          location.search.includes("state=");
        if (!hasAuthParams) {
          forceNavigate("/tenants");
          return;
        }

        // Mark that we've processed this callback to prevent duplicate processing
        callbackProcessedRef.current = true;

        // First, try with the non-org client to handle the callback
        // The Auth0 SDK will extract the token, and we can then check if it has org_id
        const auth0 = createAuth0Client(selectedDomain);

        // Process the redirect callback
        // This is critical - it extracts the auth info from the URL and stores it
        const result = await auth0.handleRedirectCallback();

        // Get the return URL from appState, defaulting to /tenants
        const returnTo = result?.appState?.returnTo || "/tenants";

        // Check if the token has an organization by decoding the ID token
        // If returnTo is a tenant path (not /tenants), we need to also cache for that org
        const pathSegments = returnTo.split("/").filter(Boolean);
        const possibleOrgId = pathSegments[0];

        // If it looks like a tenant path (not 'tenants' itself), create an org client
        // to ensure the token is also cached in the org-specific cache
        if (possibleOrgId && possibleOrgId !== "tenants") {
          try {
            // Get the token from the non-org client and check if it has org_id
            const token = await auth0.getIdTokenClaims();
            if (token?.org_id === possibleOrgId) {
              // Create the org client - this will also cache the token in the org-specific cache
              const orgAuth0 = createAuth0ClientForOrg(
                selectedDomain,
                possibleOrgId,
              );
              // Try to get a token to populate the org cache
              await orgAuth0.getTokenSilently().catch(() => {
                // It's ok if this fails - the main callback was processed
                console.log(
                  `[AuthCallback] Org token caching for ${possibleOrgId} deferred`,
                );
              });
            }
          } catch {
            // Non-critical - continue with navigation
          }
        }

        // We're being redirected back from the authentication provider
        // Navigate to the original URL or /tenants
        forceNavigate(returnTo);
      } catch (err) {
        // Only set error for real errors, not for "already processed" errors
        if (err instanceof Error) {
          const errorMessage = err.message || "";

          // Don't show errors about invalid state or missing query params
          // as these are expected in subsequent renders
          if (
            errorMessage.includes("Invalid state") ||
            errorMessage.includes("no query params")
          ) {
            forceNavigate("/tenants");
          } else {
            setError(err.message);
            // Still try to navigate after a short delay even on error
            setTimeout(() => forceNavigate("/tenants"), 3000);
          }
        } else {
          setError("Unknown error during authentication");
          // Still try to navigate after a short delay even on error
          setTimeout(() => forceNavigate("/tenants"), 3000);
        }
      }
    };

    // Execute the callback handler
    handleCallback();

    // Failsafe - if we're still on this page after 5 seconds, force navigation
    const timeoutId = setTimeout(() => {
      if (!navigationAttemptedRef.current) {
        forceNavigate("/tenants");
      }
    }, 5000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [navigate, onAuthComplete, location]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      {error ? (
        <Alert severity="error" sx={{ maxWidth: 600, mb: 2 }}>
          {error}
          <Typography variant="body2" sx={{ mt: 2 }}>
            Redirecting to application...
          </Typography>
        </Alert>
      ) : (
        <>
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Completing authentication...
          </Typography>
        </>
      )}
    </Box>
  );
}
