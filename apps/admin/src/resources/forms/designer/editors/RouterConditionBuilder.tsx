import { useController } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { OPERATOR_OPTIONS, VALUELESS_OPERATORS } from "../constants";
import type {
  Operator,
  RouterCondition,
  RouterConditionGroup,
} from "../types";
import { FieldCombobox } from "./FieldCombobox";

interface RouterConditionBuilderProps {
  name: string;
}

export function RouterConditionBuilder({ name }: RouterConditionBuilderProps) {
  const { field } = useController({ name });
  const value =
    (field.value as RouterConditionGroup | undefined) ?? { conditions: [] };
  const conditions = value.conditions ?? [];

  const update = (next: RouterCondition[]) =>
    field.onChange({ conditions: next });

  const addCondition = () =>
    update([...conditions, { field: "", operator: "equals", value: "" }]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">
        All conditions must match (AND).
      </Label>
      {conditions.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          No conditions — this rule matches everything.
        </p>
      )}
      {conditions.map((condition, idx) => {
        const operator = condition.operator ?? "equals";
        const valueless = VALUELESS_OPERATORS.includes(operator);
        return (
          <div
            key={idx}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-1.5"
          >
            <FieldCombobox
              value={condition.field}
              onChange={(f) => {
                const next = [...conditions];
                next[idx] = { ...next[idx], field: f };
                update(next);
              }}
            />
            <Select
              value={operator}
              onValueChange={(op) => {
                const next = [...conditions];
                next[idx] = { ...next[idx], operator: op as Operator };
                update(next);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              disabled={valueless}
              placeholder={valueless ? "—" : "Value"}
              value={condition.value ?? ""}
              onChange={(e) => {
                const next = [...conditions];
                next[idx] = { ...next[idx], value: e.target.value };
                update(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove condition"
              onClick={() => update(conditions.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-xs"
        onClick={addCondition}
      >
        <Plus className="h-3.5 w-3.5" />
        Add condition
      </Button>
    </div>
  );
}
