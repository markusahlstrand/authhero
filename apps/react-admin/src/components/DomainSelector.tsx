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
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import {
  DomainConfig,
  getDomainFromCookies,
  saveDomainsToCookies,
  saveSelectedDomainToCookie,
} from "../utils/domainUtils";

interface DomainSelectorProps {
  onDomainSelected: (domain: string) => void;
}

export function DomainSelector({ onDomainSelected }: DomainSelectorProps) {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [inputDomain, setInputDomain] = useState<string>("");
  const [inputClientId, setInputClientId] = useState<string>("");
  const [inputRestApiUrl, setInputRestApiUrl] = useState<string>("");
  const [showDomainDialog, setShowDomainDialog] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load domains from cookies on component mount
  useEffect(() => {
    const savedDomains = getDomainFromCookies();
    setDomains(savedDomains);
    setIsLoading(false);

    // If domains exist, show the dialog but don't auto-select
    if (savedDomains.length === 0) {
      setShowDomainDialog(true);
    }
  }, []);

  const handleAddDomain = () => {
    if (inputDomain.trim() === "") return;

    const newDomains = [
      ...domains,
      {
        url: inputDomain,
        clientId: inputClientId,
        restApiUrl: inputRestApiUrl.trim() || undefined,
      },
    ];
    setDomains(newDomains);
    saveDomainsToCookies(newDomains);
    setSelectedDomain(inputDomain);
    setInputDomain("");
    setInputClientId("");
    setInputRestApiUrl("");

    // Save the selected domain to cookies and notify parent
    saveSelectedDomainToCookie(inputDomain);
    onDomainSelected(inputDomain);

    setShowDomainDialog(false);
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    const newDomains = domains.filter(
      (domain) => domain.url !== domainToRemove,
    );
    setDomains(newDomains);
    saveDomainsToCookies(newDomains);

    if (selectedDomain === domainToRemove) {
      setSelectedDomain("");
    }

    if (newDomains.length === 0) {
      setShowDomainDialog(true);
    }
  };

  const handleSelectDomain = (domain: string) => {
    setSelectedDomain(domain);

    // Save the selected domain to cookies and notify parent
    saveSelectedDomainToCookie(domain);
    onDomainSelected(domain);

    setShowDomainDialog(false);
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
      onClose={() => (domains.length > 0 ? setShowDomainDialog(false) : null)}
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
                  button
                  onClick={() => handleSelectDomain(domain.url)}
                  selected={domain.url === selectedDomain}
                >
                  <ListItemText
                    primary={domain.url}
                    secondary={
                      domain.clientId
                        ? `Client ID: ${domain.clientId}`
                        : undefined
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveDomain(domain.url)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
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
      {domains.length > 0 && (
        <DialogActions>
          <Button onClick={() => setShowDomainDialog(false)}>Cancel</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
