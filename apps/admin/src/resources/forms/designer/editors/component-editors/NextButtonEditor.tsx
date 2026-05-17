import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { FormNodeComponent } from "../../types";

interface NextButtonEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

export function NextButtonEditor({ value, onChange }: NextButtonEditorProps) {
  if (value.type !== "NEXT_BUTTON") return null;
  const text = value.config?.text ?? "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Button text</Label>
        <Input
          value={text}
          onChange={(e) =>
            onChange({
              ...value,
              config: { ...value.config, text: e.target.value },
            })
          }
          placeholder="Continue"
        />
      </div>
    </div>
  );
}
