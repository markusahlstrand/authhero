import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { FormNodeComponent } from "../../types";

interface TextFieldEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

interface FieldComponentLike {
  id: string;
  type: string;
  category?: string;
  label?: string;
  required?: boolean;
  sensitive?: boolean;
  config?: {
    placeholder?: string;
    default_value?: string;
    multiline?: boolean;
    max_length?: number;
    min?: number;
    max?: number;
    step?: number;
    min_length?: number;
  };
}

export function TextFieldEditor({ value, onChange }: TextFieldEditorProps) {
  const v = value as unknown as FieldComponentLike;

  const updateConfig = (patch: Partial<FieldComponentLike["config"]>) =>
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
        <Label className="text-xs">Placeholder</Label>
        <Input
          value={v.config?.placeholder ?? ""}
          onChange={(e) =>
            updateConfig({ placeholder: e.target.value || undefined })
          }
        />
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

      {v.type === "TEXT" && (
        <>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-sm">Multiline</Label>
            <Switch
              checked={!!v.config?.multiline}
              onCheckedChange={(c) =>
                updateConfig({ multiline: c || undefined })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Max length</Label>
            <Input
              type="number"
              min={0}
              value={v.config?.max_length ?? ""}
              onChange={(e) =>
                updateConfig({
                  max_length:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </>
      )}

      {v.type === "NUMBER" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={v.config?.min ?? ""}
              onChange={(e) =>
                updateConfig({
                  min:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={v.config?.max ?? ""}
              onChange={(e) =>
                updateConfig({
                  max:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Step</Label>
            <Input
              type="number"
              value={v.config?.step ?? ""}
              onChange={(e) =>
                updateConfig({
                  step:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}

      {v.type === "PASSWORD" && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Minimum length</Label>
          <Input
            type="number"
            min={0}
            value={v.config?.min_length ?? ""}
            onChange={(e) =>
              updateConfig({
                min_length:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
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
