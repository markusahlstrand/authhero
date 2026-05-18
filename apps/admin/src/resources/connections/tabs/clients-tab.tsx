import { useCreatePath, useGetMany, useRecordContext } from "ra-core";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";

interface ConnectionRecord {
  id: string;
  enabled_clients?: string[];
}

interface ClientRecord {
  id: string;
  name?: string;
}

export function ClientsTab() {
  const record = useRecordContext<ConnectionRecord>();
  const createPath = useCreatePath();
  const enabledIds = record?.enabled_clients ?? [];

  const { data: clients, isLoading } = useGetMany<ClientRecord>(
    "clients",
    { ids: enabledIds },
    { enabled: enabledIds.length > 0 },
  );

  if (!record) return null;

  if (enabledIds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No clients have this connection enabled.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading clients…</p>;
  }

  const enabledSet = new Set(enabledIds);
  const linked = (clients ?? []).filter((c) => enabledSet.has(c.id));
  const linkedIds = new Set(linked.map((c) => c.id));
  const missing = enabledIds.filter((id) => !linkedIds.has(id));

  return (
    <div className="flex flex-wrap gap-2">
      {linked.map((client) => (
        <Link
          key={client.id}
          to={createPath({
            resource: "clients",
            id: client.id,
            type: "edit",
          })}
        >
          <Badge variant="secondary" className="cursor-pointer">
            {client.name ?? client.id}
          </Badge>
        </Link>
      ))}
      {missing.map((id) => (
        <Badge key={id} variant="outline">
          {id}
        </Badge>
      ))}
    </div>
  );
}
