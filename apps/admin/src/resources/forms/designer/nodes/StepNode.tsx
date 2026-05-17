import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";
import { NODE_KIND_ACCENT } from "../constants";
import { ComponentPreview } from "./ComponentPreview";

const MAX_PREVIEW = 5;

export function StepNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const components = data.components ?? [];
  const visible = components.slice(0, MAX_PREVIEW);
  const overflow = Math.max(0, components.length - MAX_PREVIEW);

  return (
    <div
      className={cn(
        "min-w-[260px] max-w-[300px] rounded-xl border bg-card shadow-sm transition-shadow",
        "bg-gradient-to-br",
        NODE_KIND_ACCENT.step,
        selected && "ring-2 ring-ring",
        data.orphaned && "border-amber-500/60 ring-1 ring-amber-500/40",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="step-input"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary"
      />
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Layers className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {data.label || "Step"}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {components.length} component{components.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {visible.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          {visible.map((component) => (
            <ComponentPreview key={component.id} component={component} />
          ))}
          {overflow > 0 && (
            <div className="text-center text-[11px] text-muted-foreground">
              +{overflow} more
            </div>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="step-output"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
