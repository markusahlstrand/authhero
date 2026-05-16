import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

interface CertificateErrorDialogProps {
  open: boolean;
  serverUrl: string;
  onClose: () => void;
}

export function CertificateErrorDialog({
  open,
  serverUrl,
  onClose,
}: CertificateErrorDialogProps) {
  const handleVisitServer = () => {
    window.open(serverUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-yellow-600" />
            SSL Certificate Not Trusted
          </DialogTitle>
          <DialogDescription>
            Unable to connect to the AuthHero server due to an untrusted SSL
            certificate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            Your local AuthHero server is using a self-signed SSL certificate
            that your browser doesn't trust yet.
          </p>
          <p>To fix this:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Click the button below to visit{" "}
              <a
                href={serverUrl}
                target="_blank"
                rel="noopener"
                className="underline"
              >
                {serverUrl}
              </a>
            </li>
            <li>
              When you see the security warning, click <strong>"Advanced"</strong>{" "}
              and then <strong>"Proceed to localhost (unsafe)"</strong>
            </li>
            <li>Return to this page and refresh</li>
          </ol>

          <Alert>
            <AlertDescription>
              <p className="font-medium mb-2">Tip:</p>
              For a better experience, install{" "}
              <a
                href="https://github.com/FiloSottile/mkcert"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                mkcert
              </a>{" "}
              to create locally-trusted certificates:
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                brew install mkcert{"\n"}mkcert -install
              </pre>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleVisitServer}>Visit {serverUrl}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CertificateErrorDialog;
