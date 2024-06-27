import { formatDistance } from "date-fns";

export function DateAgo({ date }: { date?: string }) {
  if (!date) return "N/A";
  return `${formatDistance(new Date(date), new Date())} ago`;
}
