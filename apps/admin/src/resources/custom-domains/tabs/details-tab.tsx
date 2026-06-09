import { useRecordContext, useNotify } from "ra-core";
import { Copy } from "lucide-react";
import { TextInput, SelectInput } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TxtMethod = {
  name: "txt";
  record: string;
  domain: string;
};

type HttpMethod = {
  name: "http";
  http_body: string;
  http_url: string;
};

type VerificationMethod = TxtMethod | HttpMethod;

interface CustomDomainRecord {
  verification?: {
    methods?: VerificationMethod[];
  };
}

function CopyValue({ value }: { value: string }) {
  const notify = useNotify();
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => notify("Copied to clipboard", { type: "success" }))
            .catch(() =>
              notify("Failed to copy to clipboard", { type: "warning" }),
            );
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function VerificationSection() {
  const record = useRecordContext<CustomDomainRecord>();
  const methods = record?.verification?.methods;
  if (!methods || methods.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div>
        <h3 className="text-base font-medium">Verification</h3>
        <p className="text-sm text-muted-foreground">
          Add one of the records below to your DNS (TXT) or web server (HTTP).
          Cloudflare will verify ownership and issue the certificate.
        </p>
      </div>
      <ul className="flex flex-col gap-4">
        {methods.map((m, i) =>
          m.name === "txt" ? (
            <li key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">TXT</Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Name</span>
                <CopyValue value={m.domain} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Value</span>
                <CopyValue value={m.record} />
              </div>
            </li>
          ) : (
            <li key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">HTTP</Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">URL</span>
                <CopyValue value={m.http_url} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Body</span>
                <CopyValue value={m.http_body} />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function DetailsTab() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <VerificationSection />
      <div className="flex flex-col gap-3">
        <TextInput source="domain" readOnly />
        <TextInput source="status" readOnly />

        <SelectInput
          source="domain_metadata.ssl.certificate_authority"
          label="Certificate Authority"
          choices={[
            { id: "google", name: "Google Trust Services" },
            { id: "lets_encrypt", name: "Let's Encrypt" },
            { id: "sectigo", name: "Sectigo" },
            { id: "digicert", name: "DigiCert (Enterprise)" },
          ]}
        />
        <SelectInput
          source="domain_metadata.ssl.method"
          label="SSL Verification Method"
          choices={[
            { id: "txt", name: "TXT" },
            { id: "http", name: "HTTP" },
            { id: "email", name: "Email" },
          ]}
        />
      </div>
    </div>
  );
}
