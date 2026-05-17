import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";
import { NODE_KIND_ACCENT } from "../constants";

export function EndNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border bg-card shadow-sm transition-shadow",
        "bg-gradient-to-br",
        NODE_KIND_ACCENT.end,
        selected && "ring-2 ring-ring",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="end-input"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-rose-500"
      />
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
          <Flag className="h-3.5 w-3.5 fill-current" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            Ending screen
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.resumeFlow ? "Resume auth flow" : "End flow"}
          </span>
        </div>
      </div>
    </div>
  );
}
