import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormNodeComponent } from "../../types";

interface FallbackJsonEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent, valid: boolean) => void;
}

export function FallbackJsonEditor({
  value,
  onChange,
}: FallbackJsonEditorProps) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(value, null, 2));
    setError(null);
  }, [value.id]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">
        This component type doesn&apos;t have a bespoke editor yet. Edit the raw
        JSON below.
      </Label>
      <Textarea
        rows={16}
        className="font-mono text-xs"
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          try {
            const parsed = JSON.parse(next) as FormNodeComponent;
            setError(null);
            onChange(parsed, true);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Invalid JSON";
            setError(message);
            onChange(value, false);
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
