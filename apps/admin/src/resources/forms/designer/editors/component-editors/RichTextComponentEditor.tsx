import type { FormNodeComponent } from "../../types";
import { RichTextEditor } from "../../rich-text/RichTextEditor";

interface RichTextComponentEditorProps {
  value: FormNodeComponent;
  onChange: (next: FormNodeComponent) => void;
}

export function RichTextComponentEditor({
  value,
  onChange,
}: RichTextComponentEditorProps) {
  if (value.type !== "RICH_TEXT") return null;
  return (
    <RichTextEditor
      value={value.config?.content ?? ""}
      onChange={(content) =>
        onChange({ ...value, config: { ...value.config, content } })
      }
    />
  );
}
