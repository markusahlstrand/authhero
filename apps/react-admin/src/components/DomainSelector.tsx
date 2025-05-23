import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  CircularProgress,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import {
  ConnectionMethod,
  DomainConfig,
  getDomainFromStorage,
  saveDomainToStorage,
  saveSelectedDomainToStorage,
  formatDomain,
} from "../utils/domainUtils";

interface DomainSelectorProps {
  onDomainSelected: (domain: string) => void;
  disableCloseOnRootPath?: boolean;
}

export function DomainSelector({
  onDomainSelected,
  disableCloseOnRootPath = false,
}: DomainSelectorProps) {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [inputDomain, setInputDomain] = useState<string>("");
  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("login");

  // Login method fields
  const [inputClientId, setInputClientId] = useState<string>("");
  const [inputRestApiUrl, setInputRestApiUrl] = useState<string>("");

  // Token method field
  const [inputToken, setInputToken] = useState<string>("");

  // Client credentials fields
  const [inputClientSecret, setInputClientSecret] = useState<string>("");

  const [showDomainDialog, setShowDomainDialog] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load domains from cookies on component mount
  useEffect(() => {
    const savedDomains = getDomainFromStorage();
    setDomains(savedDomains);
    setIsLoading(false);

    // If domains exist, show the dialog but don't auto-select
    if (savedDomains.length === 0) {
      setShowDomainDialog(true);
    }
  }, []);

  // Helper function to navigate after domain selection
  const selectDomainAndNavigate = (domain: string) => {
    // Save the selected domain to cookies and notify parent
    saveSelectedDomainToStorage(domain);
    onDomainSelected(domain);

    // Close dialog
    setShowDomainDialog(false);

    // Get the current path to preserve tenant segment if it exists
    const currentPath = window.location.pathname;
    const pathSegments = currentPath.split("/").filter(Boolean);

    // Check if the first segment is a tenant ID (not "tenants")
    if (pathSegments.length > 0 && pathSegments[0] !== "tenants") {
      const tenantId = pathSegments[0];
      // Preserve the tenant ID in the URL
      window.location.href = `/${tenantId}`;
    } else {
      // Otherwise navigate to the tenants page to trigger auth flow
      window.location.href = "/tenants";
    }
  };

  const handleAddDomain = () => {
    if (inputDomain.trim() === "") return;

    // Format the domain to ensure consistency (remove http/https)
    const formattedDomain = formatDomain(inputDomain);

    let newDomainConfig: DomainConfig;

    switch (connectionMethod) {
      case "login":
        newDomainConfig = {
          url: formattedDomain, // Use formatted domain
          connectionMethod: "login",
          clientId: inputClientId,
          restApiUrl: inputRestApiUrl.trim() || undefined,
        };
        break;
      case "token":
        newDomainConfig = {
          url: formattedDomain, // Use formatted domain
          connectionMethod: "token",
          token: inputToken,
        };
        break;
      case "client_credentials":
        newDomainConfig = {
          url: formattedDomain, // Use formatted domain
          connectionMethod: "client_credentials",
          clientId: inputClientId,
          clientSecret: inputClientSecret,
        };
        break;
      default:
        return; // Invalid connection method
    }

    // Check if domain with the same formatted URL already exists
    const domainExists = domains.some((d) => d.url === formattedDomain);
    let newDomains;

    if (domainExists) {
      // Update existing domain
      newDomains = domains.map((d) =>
        d.url === formattedDomain ? newDomainConfig : d,
      );
    } else {
      // Add new domain
      newDomains = [...domains, newDomainConfig];
    }

    // Save the domains to storage and update state
    saveDomainToStorage(newDomains);
    setDomains(newDomains);

    // Don't automatically navigate, just highlight the new domain
    setSelectedDomain(formattedDomain);

    // Reset all input fields
    setInputDomain("");
    setInputClientId("");
    setInputRestApiUrl("");
    setInputToken("");
    setInputClientSecret("");

    // Toast or feedback message could be added here
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    const newDomains = domains.filter(
      (domain) => domain.url !== domainToRemove,
    );
    setDomains(newDomains);
    saveDomainToStorage(newDomains);

    if (selectedDomain === domainToRemove) {
      setSelectedDomain("");
    }

    if (newDomains.length === 0) {
      setShowDomainDialog(true);
    }
  };

  const handleSelectDomain = (domain: string) => {
    const formattedDomain = formatDomain(domain);
    setSelectedDomain(formattedDomain);

    // Use the helper function to select domain and navigate
    selectDomainAndNavigate(formattedDomain);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Dialog
      open={showDomainDialog}
      onClose={() => {
        // If we're on root path and disableCloseOnRootPath is true, don't allow closing
        if (disableCloseOnRootPath) {
          return;
        }
        // Otherwise follow the existing logic
        if (domains.length > 0) {
          setShowDomainDialog(false);
        }
      }}
    >
      <DialogTitle>Select Auth Domain</DialogTitle>
      <DialogContent>
        <Box sx={{ minWidth: 400, my: 2 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Please select or add an authentication domain to connect to.
          </Typography>

          {domains.length > 0 && (
            <List>
              {domains.map((domain) => (
                <ListItem
                  key={domain.url}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDomain(domain.url);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <Box
                    onClick={() => handleSelectDomain(domain.url)}
                    sx={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      width: "100%",
                      cursor: "pointer",
                      textTransform: "none",
                      padding: "8px 16px",
                      backgroundColor:
                        domain.url === selectedDomain
                          ? "rgba(0, 0, 0, 0.04)"
                          : "transparent",
                      "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.08)",
                      },
                    }}
                  >
                    <ListItemText
                      primary={domain.url}
                      secondary={
                        <>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {domain.connectionMethod === "login"
                              ? "Login"
                              : domain.connectionMethod === "token"
                                ? "API Token"
                                : "Client Credentials"}
                          </Typography>
                          {domain.connectionMethod === "login" &&
                            domain.clientId && (
                              <> · Client ID: {domain.clientId}</>
                            )}
                          {domain.connectionMethod === "client_credentials" &&
                            domain.clientId && (
                              <> · Client ID: {domain.clientId}</>
                            )}
                        </>
                      }
                    />
                  </Box>
                </ListItem>
              ))}
            </List>
          )}

          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              fullWidth
              label="Auth Domain"
              variant="outlined"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="e.g., auth2.sesamy.dev"
            />

            <FormControl fullWidth>
              <InputLabel id="connection-method-label">
                Connection Method
              </InputLabel>
              <Select
                labelId="connection-method-label"
                id="connection-method"
                value={connectionMethod}
                label="Connection Method"
                onChange={(e) =>
                  setConnectionMethod(e.target.value as ConnectionMethod)
                }
              >
                <MenuItem value="login">Login (Authentication Flow)</MenuItem>
                <MenuItem value="token">API Token</MenuItem>
                <MenuItem value="client_credentials">
                  Client Credentials
                </MenuItem>
              </Select>
              <FormHelperText>
                Select how you want to connect to the Auth domain
              </FormHelperText>
            </FormControl>

            {/* Conditional fields based on connection method */}
            {connectionMethod === "login" && (
              <>
                <TextField
                  fullWidth
                  label="Client ID"
                  variant="outlined"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                  placeholder="e.g., your-client-id"
                />
                <TextField
                  fullWidth
                  label="REST API URL"
                  variant="outlined"
                  value={inputRestApiUrl}
                  onChange={(e) => setInputRestApiUrl(e.target.value)}
                  placeholder="e.g., https://api.example.com"
                />
              </>
            )}

            {connectionMethod === "token" && (
              <TextField
                fullWidth
                label="API Token"
                variant="outlined"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="Bearer eyJhbGciOiJIUzI1..."
                multiline
                rows={3}
              />
            )}

            {connectionMethod === "client_credentials" && (
              <>
                <TextField
                  fullWidth
                  label="Client ID"
                  variant="outlined"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                  placeholder="e.g., your-client-id"
                />
                <TextField
                  fullWidth
                  label="Client Secret"
                  variant="outlined"
                  type="password"
                  value={inputClientSecret}
                  onChange={(e) => setInputClientSecret(e.target.value)}
                  placeholder="e.g., your-client-secret"
                />
              </>
            )}

            <Button
              variant="contained"
              color="primary"
              onClick={handleAddDomain}
              startIcon={<AddIcon />}
            >
              Add
            </Button>
          </Box>
        </Box>
      </DialogContent>
      {domains.length > 0 && !disableCloseOnRootPath && (
        <DialogActions>
          <Button onClick={() => setShowDomainDialog(false)}>Cancel</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
