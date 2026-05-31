import { useRecordContext } from "ra-core";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ClientLike = {
  client_id?: string;
  client_metadata?: Record<string, unknown> | null;
};

export function isCimdClient(record: ClientLike | undefined): boolean {
  return record?.client_metadata?.cimd === "true";
}

export function CimdBanner() {
  const record = useRecordContext<ClientLike>();
  if (!isCimdClient(record)) return null;
  return (
    <Alert className="mb-4">
      <Info />
      <AlertTitle>Managed via Client ID Metadata Document</AlertTitle>
      <AlertDescription>
        This client configuration is read-only. Configuration is fetched on
        every request from{" "}
        <a
          href={record!.client_id}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {record!.client_id}
        </a>
        . PATCH /clients/{"{id}"} is rejected with a 400 — update the document
        instead. Connections are updated via PATCH /clients/{"{id}"}
        /connections.
      </AlertDescription>
    </Alert>
  );
}
