import { useGetList } from "ra-core";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FlowRecord {
  id: string;
  name?: string;
}

interface FlowSelectProps {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
}

const EMPTY = "__none__";

export function FlowSelect({
  label,
  value,
  onChange,
  placeholder = "Select flow",
}: FlowSelectProps) {
  const { data, isPending, error } = useGetList<FlowRecord>("flows", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  const flows = data ?? [];

  // A saved flow_id may point at a flow that is missing from the first page,
  // or was deleted. Keep it selectable so opening the node never silently
  // drops the reference.
  const hasValue = typeof value === "string" && value.length > 0;
  const isKnown = hasValue && flows.some((flow) => flow.id === value);

  // Without a list to pick from there is nothing to select — fall back to the
  // raw id so the node stays editable.
  if (error) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          placeholder="flow_..."
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        <span className="text-xs text-muted-foreground">
          Could not load flows — enter the flow ID manually.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={hasValue ? value : EMPTY}
        onValueChange={(next) => onChange(next === EMPTY ? undefined : next)}
        disabled={isPending}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={isPending ? "Loading flows…" : placeholder}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY}>None</SelectItem>
          {hasValue && !isKnown && (
            <SelectItem value={value}>
              <span className="font-mono text-xs">{value}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                (unknown flow)
              </span>
            </SelectItem>
          )}
          {flows.map((flow) => (
            <SelectItem key={flow.id} value={flow.id}>
              <span className="flex-1">{flow.name || flow.id}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
