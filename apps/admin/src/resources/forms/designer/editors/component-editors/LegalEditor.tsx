import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FormNodeComponent } from "../../types";

interface LegalEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

export function LegalEditor({ value, onChange }: LegalEditorProps) {
  if (value.type !== "LEGAL") return null;
  const text = value.config?.text ?? "";
  const html = value.config?.html ?? false;

  const emit = (nextText: string, nextHtml: boolean) =>
    onChange({
      ...value,
      config: { text: nextText, html: nextHtml || undefined },
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Legal text</Label>
        <Textarea
          rows={6}
          value={text}
          onChange={(e) => emit(e.target.value, html)}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border p-2">
        <Label className="text-sm">Render as HTML</Label>
        <Switch
          checked={html}
          onCheckedChange={(c) => emit(text, c)}
        />
      </div>
    </div>
  );
}
