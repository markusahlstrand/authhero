import { useController } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { NodeTargetSelect } from "./NodeTargetSelect";
import { ComponentList } from "./ComponentList";

interface StepEditorProps {
  index: number;
}

export function StepEditor({ index }: StepEditorProps) {
  const base = `nodes.${index}` as const;
  const { field: alias } = useController({ name: `${base}.alias` });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Step</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Alias</Label>
            <Input
              value={(alias.value as string | undefined) ?? ""}
              onChange={(e) => alias.onChange(e.target.value || undefined)}
              placeholder="Friendly name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Components</CardTitle>
        </CardHeader>
        <CardContent>
          <ComponentList nodeIndex={index} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Routing</CardTitle>
        </CardHeader>
        <CardContent>
          <NodeTargetSelect
            name={`${base}.config.next_node`}
            label="Next node"
            placeholder="Select next node"
            excludeNodeIds={[]}
            allowEmpty
          />
        </CardContent>
      </Card>
    </div>
  );
}
