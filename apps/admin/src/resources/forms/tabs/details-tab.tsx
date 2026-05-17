import { useRecordContext } from "ra-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextInput } from "@/components/admin";

interface FormRecord {
  id?: string | number;
  created_at?: string;
  updated_at?: string;
}

export function DetailsTab() {
  const record = useRecordContext<FormRecord>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic information</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TextInput source="id" readOnly />
        <TextInput source="name" required />
        {record?.created_at && (
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-muted-foreground">
              Created at
            </div>
            <div className="text-sm">
              {new Date(record.created_at).toLocaleString()}
            </div>
          </div>
        )}
        {record?.updated_at && (
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-muted-foreground">
              Updated at
            </div>
            <div className="text-sm">
              {new Date(record.updated_at).toLocaleString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
