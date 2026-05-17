import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { DropdownOption } from "../../types";

interface OptionsListEditorProps {
  value: DropdownOption[];
  onChange: (next: DropdownOption[]) => void;
}

export function OptionsListEditor({ value, onChange }: OptionsListEditorProps) {
  const update = (idx: number, patch: Partial<DropdownOption>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Options</Label>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">No options yet.</p>
      )}
      {value.map((option, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            placeholder="Label"
            value={option.label}
            onChange={(e) => update(idx, { label: e.target.value })}
          />
          <Input
            placeholder="Value"
            value={option.value}
            onChange={(e) => update(idx, { value: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove option"
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...value, { label: "", value: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add option
      </Button>
    </div>
  );
}
