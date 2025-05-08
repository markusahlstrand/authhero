import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CircularProgress, Box, Typography } from "@mui/material";
import { getSelectedDomainFromCookie } from "./utils/domainUtils";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Get the currently selected domain from cookies
    const selectedDomain = getSelectedDomainFromCookie();

    if (!selectedDomain) {
      // If no domain is selected, redirect to the home page to select one
      navigate("/");
      return;
    }

    // We're being redirected back from the authentication provider
    // Just redirect to the main application
    navigate("/tenants");
  }, [navigate]);

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
      <CircularProgress />
      <Typography variant="h6" sx={{ mt: 2 }}>
        Completing authentication...
      </Typography>
    </Box>
  );
}
