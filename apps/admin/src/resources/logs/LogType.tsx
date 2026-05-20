import { getLogTypeDescription } from "@/lib/logs";

export function LogType({ type }: { type: string }) {
  return getLogTypeDescription(type);
}
