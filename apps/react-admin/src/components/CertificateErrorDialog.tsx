import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Link,
  Box,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

interface CertificateErrorDialogProps {
  open: boolean;
  serverUrl: string;
  onClose: () => void;
}

export const CertificateErrorDialog: React.FC<CertificateErrorDialogProps> = ({
  open,
  serverUrl,
  onClose,
}) => {
  const handleVisitServer = () => {
    window.open(serverUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberIcon color="warning" />
        SSL Certificate Not Trusted
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Unable to connect to the AuthHero server due to an untrusted SSL
          certificate.
        </Alert>

        <Typography variant="body1" paragraph>
          Your local AuthHero server is using a self-signed SSL certificate that
          your browser doesn't trust yet.
        </Typography>

        <Typography variant="body1" paragraph>
          To fix this, please:
        </Typography>

        <Box component="ol" sx={{ pl: 2 }}>
          <li>
            <Typography variant="body2" paragraph>
              Click the button below to visit{" "}
              <Link href={serverUrl} target="_blank" rel="noopener">
                {serverUrl}
              </Link>
            </Typography>
          </li>
          <li>
            <Typography variant="body2" paragraph>
              When you see the security warning, click{" "}
              <strong>"Advanced"</strong> and then{" "}
              <strong>"Proceed to localhost (unsafe)"</strong>
            </Typography>
          </li>
          <li>
            <Typography variant="body2" paragraph>
              Return to this page and refresh
            </Typography>
          </li>
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Tip:</strong> For a better experience, install{" "}
            <Link
              href="https://github.com/FiloSottile/mkcert"
              target="_blank"
              rel="noopener"
            >
              mkcert
            </Link>{" "}
            to create locally-trusted certificates:
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1,
              p: 1,
              bgcolor: "grey.100",
              borderRadius: 1,
              fontSize: "0.85em",
              overflow: "auto",
            }}
          >
            brew install mkcert{"\n"}
            mkcert -install
          </Box>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Then delete the <code>.certs</code> folder in your auth-server
            directory and restart the server.
          </Typography>
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleVisitServer}>
          Visit {serverUrl}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CertificateErrorDialog;
