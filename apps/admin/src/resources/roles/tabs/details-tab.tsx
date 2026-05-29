import { useRecordContext } from "ra-core";
import { TextInput } from "@/components/admin";

export function DetailsTab() {
  const record = useRecordContext<{ id?: string }>();

  return (
    <div className="flex flex-col gap-4">
      {record?.id && <TextInput source="id" readOnly />}
      <TextInput source="name" required />
      <TextInput source="description" multiline />
    </div>
  );
}
