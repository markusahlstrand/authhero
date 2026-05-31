import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AuthHeroDataProvider } from "../../../auth0DataProvider";

interface CustomDomainRecord {
  id?: string;
  custom_domain_id?: string;
}

const PEM_CERT =
  /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/;
const PEM_KEY =
  /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s*$/;

export function CertificateTab() {
  const record = useRecordContext<CustomDomainRecord>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();

  const [certificate, setCertificate] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [busy, setBusy] = useState(false);

  const id = record?.id ?? record?.custom_domain_id;
  const certValid = PEM_CERT.test(certificate.trim());
  const keyValid = PEM_KEY.test(privateKey.trim());
  const canSubmit = !!id && !busy && certValid && keyValid;

  const handleUpload = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await dataProvider.uploadCustomDomainCertificate(id, {
        certificate: certificate.trim(),
        private_key: privateKey.trim(),
      });
      notify("Certificate uploaded", { type: "success" });
      setCertificate("");
      setPrivateKey("");
      refresh();
    } catch (err) {
      notify(
        err instanceof Error
          ? `Failed to upload certificate: ${err.message}`
          : "Failed to upload certificate",
        { type: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="rounded-md border p-4">
        <h3 className="text-base font-medium">Upload TLS certificate</h3>
        <p className="text-sm text-muted-foreground">
          Paste a PEM-encoded certificate (with the full chain, leaf first) and
          the matching private key. The cert and key are forwarded to the edge
          and are not stored by authhero. To convert a PFX file:{" "}
          <code className="font-mono text-xs">
            openssl pkcs12 -in cert.pfx -nodes -out cert.pem
          </code>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="cert-pem" className="text-sm font-medium">
          Certificate (PEM)
        </label>
        <Textarea
          id="cert-pem"
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
          placeholder={
            "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
          }
          value={certificate}
          onChange={(e) => setCertificate(e.target.value)}
        />
        {certificate && !certValid && (
          <span className="text-xs text-destructive">
            Doesn't look like a PEM-encoded certificate.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="key-pem" className="text-sm font-medium">
          Private key (PEM)
        </label>
        <Textarea
          id="key-pem"
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
          placeholder={
            "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
          }
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
        />
        {privateKey && !keyValid && (
          <span className="text-xs text-destructive">
            Doesn't look like a PEM-encoded private key.
          </span>
        )}
      </div>

      <div>
        <Button type="button" disabled={!canSubmit} onClick={handleUpload}>
          <ShieldCheck className="h-4 w-4 mr-1" />
          {busy ? "Uploading..." : "Upload certificate"}
        </Button>
      </div>
    </div>
  );
}
