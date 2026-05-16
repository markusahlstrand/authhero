import { useRecordContext } from "ra-core";
import { JsonOutput } from "@/common/JsonOutput";
import type { UserRecord } from "./types";

export function RawJsonTab() {
  const record = useRecordContext<UserRecord>();
  if (!record) return null;
  return <JsonOutput data={record} />;
}
