import { useRecordContext } from "ra-core";
import { JsonOutput } from "@/common/JsonOutput";

export function RawJsonTab() {
  const record = useRecordContext();
  if (!record) return null;
  return <JsonOutput data={record} />;
}
