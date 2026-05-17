import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { FormNodeComponent } from "../../types";

interface DateEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

interface DateLike {
  id: string;
  type: "DATE";
  label?: string;
  required?: boolean;
  config?: {
    format?: "DATE" | "TIME" | "DATETIME";
    min?: string;
    max?: string;
    default_value?: string;
  };
}

export function DateEditor({ value, onChange }: DateEditorProps) {
  if (value.type !== "DATE") return null;
  const v = value as unknown as DateLike;

  const updateConfig = (patch: Partial<DateLike["config"]>) =>
    onChange({
      ...(value as FormNodeComponent),
      config: { ...(v.config ?? {}), ...patch },
    } as FormNodeComponent);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={v.label ?? ""}
          onChange={(e) =>
            onChange({
              ...(value as FormNodeComponent),
              label: e.target.value || undefined,
            } as FormNodeComponent)
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Format</Label>
        <Select
          value={v.config?.format ?? "DATE"}
          onValueChange={(next) =>
            updateConfig({ format: next as "DATE" | "TIME" | "DATETIME" })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DATE">Date</SelectItem>
            <SelectItem value="TIME">Time</SelectItem>
            <SelectItem value="DATETIME">Date & time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Min</Label>
          <Input
            value={v.config?.min ?? ""}
            onChange={(e) => updateConfig({ min: e.target.value || undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Max</Label>
          <Input
            value={v.config?.max ?? ""}
            onChange={(e) => updateConfig({ max: e.target.value || undefined })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Default value</Label>
        <Input
          value={v.config?.default_value ?? ""}
          onChange={(e) =>
            updateConfig({ default_value: e.target.value || undefined })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border p-2">
        <Label className="text-sm">Required</Label>
        <Switch
          checked={!!v.required}
          onCheckedChange={(c) =>
            onChange({
              ...(value as FormNodeComponent),
              required: c || undefined,
            } as FormNodeComponent)
          }
        />
      </div>
    </div>
  );
}
