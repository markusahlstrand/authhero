import { useController } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { NodeTargetSelect } from "./NodeTargetSelect";

interface FlowNodeEditorProps {
  index: number;
}

export function FlowNodeEditor({ index }: FlowNodeEditorProps) {
  const base = `nodes.${index}` as const;
  const { field: alias } = useController({ name: `${base}.alias` });
  const { field: flowId } = useController({ name: `${base}.config.flow_id` });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Flow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Alias</Label>
            <Input
              value={(alias.value as string | undefined) ?? ""}
              onChange={(e) => alias.onChange(e.target.value || undefined)}
              placeholder="Friendly name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Flow ID</Label>
            <Input
              value={(flowId.value as string | undefined) ?? ""}
              onChange={(e) => flowId.onChange(e.target.value)}
              placeholder="flow_..."
            />
          </div>
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
            allowEmpty
          />
        </CardContent>
      </Card>
    </div>
  );
}
