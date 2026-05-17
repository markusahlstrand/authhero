import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";
import { NODE_KIND_ACCENT } from "../constants";

export function StartNode({ selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div
      className={cn(
        "min-w-[160px] rounded-xl border bg-card shadow-sm transition-shadow",
        "bg-gradient-to-br",
        NODE_KIND_ACCENT.start,
        selected && "ring-2 ring-ring",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Play className="h-3.5 w-3.5 fill-current" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">Start</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Entry point
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="start-output"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-emerald-500"
      />
    </div>
  );
}
