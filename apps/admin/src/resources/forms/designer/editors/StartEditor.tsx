import { useController } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

import { NodeTargetSelect } from "./NodeTargetSelect";

interface HiddenField {
  key: string;
  value: string;
}

function HiddenFields() {
  const { field } = useController<{ "start.hidden_fields": HiddenField[] }>({
    name: "start.hidden_fields" as never,
  });
  const items = (field.value as unknown as HiddenField[]) ?? [];

  const update = (next: HiddenField[]) =>
    field.onChange(next.length ? next : undefined);

  return (
    <div className="flex flex-col gap-2">
      {items.map((row, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            placeholder="Key"
            value={row.key}
            onChange={(e) => {
              const next = [...items];
              next[idx] = { ...next[idx], key: e.target.value };
              update(next);
            }}
          />
          <Input
            placeholder="Value"
            value={row.value}
            onChange={(e) => {
              const next = [...items];
              next[idx] = { ...next[idx], value: e.target.value };
              update(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => update(items.filter((_, i) => i !== idx))}
            aria-label="Remove hidden field"
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
        onClick={() => update([...items, { key: "", value: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add hidden field
      </Button>
    </div>
  );
}

export function StartEditor() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Routing</CardTitle>
        </CardHeader>
        <CardContent>
          <NodeTargetSelect
            name="start.next_node"
            label="Next node"
            placeholder="Select where the flow starts"
            allowEmpty
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Hidden fields</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">
            Values prefilled into the form session and not shown to the user.
          </Label>
          <HiddenFields />
        </CardContent>
      </Card>
    </div>
  );
}
