import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";
import { NODE_KIND_ACCENT } from "../constants";

export function FlowNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div
      className={cn(
        "min-w-[200px] rounded-xl border bg-card shadow-sm transition-shadow",
        "bg-gradient-to-br",
        NODE_KIND_ACCENT.flow,
        selected && "ring-2 ring-ring",
        data.orphaned && "border-amber-500/60 ring-1 ring-amber-500/40",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="flow-input"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-sky-500"
      />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
          <RefreshCw className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {data.label || "Flow"}
          </span>
          <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.flowId ? `Execute ${data.flowId}` : "Update metadata"}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="flow-output"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-sky-500"
      />
    </div>
  );
}
