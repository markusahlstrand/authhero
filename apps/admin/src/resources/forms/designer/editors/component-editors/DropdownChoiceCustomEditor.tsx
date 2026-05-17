import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import type { DropdownOption, FormNodeComponent } from "../../types";
import { OptionsListEditor } from "./OptionsListEditor";

interface DropdownChoiceCustomEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

interface FieldLike {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  config?: {
    options?: DropdownOption[];
    placeholder?: string;
    multiple?: boolean;
    searchable?: boolean;
    default_value?: string | string[];
    code?: string;
    schema?: Record<string, unknown>;
  };
}

export function DropdownChoiceCustomEditor({
  value,
  onChange,
}: DropdownChoiceCustomEditorProps) {
  const v = value as unknown as FieldLike;

  const updateConfig = (patch: Partial<FieldLike["config"]>) =>
    onChange({
      ...(value as FormNodeComponent),
      config: { ...(v.config ?? {}), ...patch },
    } as FormNodeComponent);

  if (v.type === "CUSTOM") {
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
          <Label className="text-xs">Code</Label>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            value={v.config?.code ?? ""}
            onChange={(e) => updateConfig({ code: e.target.value || undefined })}
          />
        </div>
      </div>
    );
  }

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

      {v.type === "DROPDOWN" && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Placeholder</Label>
          <Input
            value={v.config?.placeholder ?? ""}
            onChange={(e) =>
              updateConfig({ placeholder: e.target.value || undefined })
            }
          />
        </div>
      )}

      <OptionsListEditor
        value={v.config?.options ?? []}
        onChange={(options) => updateConfig({ options })}
      />

      <div className="flex items-center justify-between rounded-md border p-2">
        <Label className="text-sm">Allow multiple</Label>
        <Switch
          checked={!!v.config?.multiple}
          onCheckedChange={(c) => updateConfig({ multiple: c || undefined })}
        />
      </div>

      {v.type === "DROPDOWN" && (
        <div className="flex items-center justify-between rounded-md border p-2">
          <Label className="text-sm">Searchable</Label>
          <Switch
            checked={!!v.config?.searchable}
            onCheckedChange={(c) => updateConfig({ searchable: c || undefined })}
          />
        </div>
      )}

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
