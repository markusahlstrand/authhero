import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CircularProgress, Box, Typography, Alert } from "@mui/material";
import { getSelectedDomainFromCookie } from "./utils/domainUtils";
import { createAuth0Client } from "./authProvider";

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
        const selectedDomain = getSelectedDomainFromCookie();

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

        // Get the auth0 client for the selected domain
        const auth0 = createAuth0Client(selectedDomain);

        // Mark that we've processed this callback to prevent duplicate processing
        callbackProcessedRef.current = true;

        // Process the redirect callback
        // This is critical - it extracts the auth info from the URL and stores it
        await auth0.handleRedirectCallback();

        // We're being redirected back from the authentication provider
        // Force redirect to the main application
        forceNavigate("/tenants");
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
