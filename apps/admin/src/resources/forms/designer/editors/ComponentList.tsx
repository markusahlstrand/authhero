import { useState } from "react";
import { useController } from "react-hook-form";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { FormNodeComponent } from "../types";
import { COMPONENT_TYPE_OPTIONS, randomId } from "../constants";
import { ComponentPreview } from "../nodes/ComponentPreview";
import { AddComponentMenu } from "./AddComponentMenu";
import { ComponentEditorDialog } from "./ComponentEditorDialog";

interface ComponentListProps {
  nodeIndex: number;
}

function makeNewComponent(type: string): FormNodeComponent {
  const id = randomId(type.toLowerCase());
  const base = { id, type } as unknown as FormNodeComponent;
  if (type === "NEXT_BUTTON") {
    return { ...base, category: "BLOCK", config: { text: "Continue" } } as FormNodeComponent;
  }
  if (type === "RICH_TEXT") {
    return { ...base, category: "BLOCK", config: { content: "" } } as FormNodeComponent;
  }
  if (type === "LEGAL") {
    return { ...base, category: "FIELD", config: { text: "" } } as FormNodeComponent;
  }
  if (["TEXT", "EMAIL", "NUMBER", "TEL", "URL", "PASSWORD"].includes(type)) {
    return {
      ...base,
      category: "FIELD",
      label: "Field",
      config: { placeholder: "" },
    } as FormNodeComponent;
  }
  if (type === "DROPDOWN" || type === "CHOICE") {
    return {
      ...base,
      category: "FIELD",
      label: type === "DROPDOWN" ? "Select" : "Choose",
      config: { options: [] },
    } as FormNodeComponent;
  }
  if (type === "DATE") {
    return {
      ...base,
      category: "FIELD",
      label: "Date",
      config: { format: "DATE" },
    } as FormNodeComponent;
  }
  if (type === "CUSTOM") {
    return {
      ...base,
      category: "FIELD",
      label: "Custom",
      config: { code: "" },
    } as FormNodeComponent;
  }
  return { ...base, category: "BLOCK", config: {} } as FormNodeComponent;
}

export function ComponentList({ nodeIndex }: ComponentListProps) {
  const { field } = useController({
    name: `nodes.${nodeIndex}.config.components`,
  });
  const components = (field.value as FormNodeComponent[] | undefined) ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = components.find((c) => c.id === editingId) ?? null;

  const update = (next: FormNodeComponent[]) => field.onChange(next);

  const handleAdd = (type: string) => {
    const next = makeNewComponent(type);
    update([...components, next]);
    setEditingId(next.id);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    [next[idx], next[target]] = [next[target], next[idx]];
    update(next);
  };

  const remove = (id: string) =>
    update(components.filter((c) => c.id !== id));

  const replace = (next: FormNodeComponent) =>
    update(components.map((c) => (c.id === next.id ? next : c)));

  return (
    <div className="flex flex-col gap-2">
      {components.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No components yet. Add one to start collecting input.
        </p>
      ) : (
        components.map((component, idx) => {
          const option = COMPONENT_TYPE_OPTIONS.find(
            (opt) => opt.type === component.type,
          );
          return (
            <div
              key={component.id}
              className="flex items-center gap-2 rounded-md border bg-card/40 p-2"
            >
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label="Move up"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label="Move down"
                  disabled={idx === components.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {option?.label ?? component.type}
                  </span>
                  {option && !option.bespoke && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      JSON
                    </Badge>
                  )}
                </div>
                <div className="mt-1">
                  <ComponentPreview component={component} />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Edit"
                onClick={() => setEditingId(component.id)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Delete"
                onClick={() => remove(component.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })
      )}
      <AddComponentMenu onAdd={handleAdd} />

      <ComponentEditorDialog
        open={editing !== null}
        component={editing}
        onClose={() => setEditingId(null)}
        onSave={(next) => replace(next)}
      />
    </div>
  );
}
