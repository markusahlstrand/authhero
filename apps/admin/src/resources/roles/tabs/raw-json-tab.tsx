import { useRecordContext } from "ra-core";
import type { RaRecord } from "ra-core";
import { JsonOutput } from "@/common/JsonOutput";

export function RawJsonTab() {
  const record = useRecordContext<RaRecord>();
  if (!record) return null;
  return <JsonOutput data={record} />;
}
