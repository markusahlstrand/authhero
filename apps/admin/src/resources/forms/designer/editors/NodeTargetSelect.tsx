import { useController, useWatch } from "react-hook-form";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { ENDING_TARGET } from "../constants";
import type { FormNode } from "../types";

interface NodeTargetSelectProps {
  name: string;
  label: string;
  placeholder?: string;
  excludeNodeIds?: string[];
  includeEnding?: boolean;
  allowEmpty?: boolean;
}

export function NodeTargetSelect({
  name,
  label,
  placeholder = "Select node",
  excludeNodeIds = [],
  includeEnding = true,
  allowEmpty = false,
}: NodeTargetSelectProps) {
  const { field } = useController({ name });
  const nodes = (useWatch({ name: "nodes" }) as FormNode[] | undefined) ?? [];

  const EMPTY = "__none__";
  const value =
    field.value === undefined || field.value === null || field.value === ""
      ? EMPTY
      : (field.value as string);

  const options = nodes.filter((n) => !excludeNodeIds.includes(n.id));

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value}
        onValueChange={(next) =>
          field.onChange(next === EMPTY ? undefined : next)
        }
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={EMPTY}>None</SelectItem>}
          {options.map((node) => (
            <SelectItem key={node.id} value={node.id}>
              {node.alias || node.id}
            </SelectItem>
          ))}
          {includeEnding && (
            <SelectItem value={ENDING_TARGET}>Ending</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
