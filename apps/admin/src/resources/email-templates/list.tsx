import { List, DataTable } from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Badge } from "@/components/ui/badge";

interface EmailTemplateRecord {
  id: string;
  template: string;
  label: string;
  is_override: boolean;
  enabled?: boolean;
  subject?: string;
}

function StatusBadge() {
  const record = useRecordContext<EmailTemplateRecord>();
  if (!record) return null;
  if (!record.is_override) {
    return <Badge variant="secondary">Default</Badge>;
  }
  if (record.enabled === false) {
    return <Badge variant="outline">Disabled</Badge>;
  }
  return <Badge>Customized</Badge>;
}

function SubjectField() {
  const record = useRecordContext<EmailTemplateRecord>();
  if (!record?.is_override || !record.subject) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <>{record.subject}</>;
}

export function EmailTemplatesList() {
  return (
    <List
      sort={{ field: "label", order: "ASC" }}
      pagination={false}
      perPage={50}
    >
      <DataTable rowClick="edit">
        <DataTable.Col source="label" label="Template" />
        <DataTable.Col label="Status">
          <StatusBadge />
        </DataTable.Col>
        <DataTable.Col label="Subject">
          <SubjectField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
