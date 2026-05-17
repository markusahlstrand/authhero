import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeData } from "../types";
import { NODE_KIND_ACCENT } from "../constants";

export function RouterNode({
  data,
  selected,
}: NodeProps<Node<CanvasNodeData>>) {
  const rules = data.rules ?? [];

  return (
    <div
      className={cn(
        "min-w-[220px] rounded-xl border bg-card shadow-sm transition-shadow",
        "bg-gradient-to-br",
        NODE_KIND_ACCENT.router,
        selected && "ring-2 ring-ring",
        data.orphaned && "border-amber-500/60 ring-1 ring-amber-500/40",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="router-input"
        className="!h-2.5 !w-2.5 !border-2 !border-card !bg-violet-500"
      />
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {data.label || "Router"}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className="relative flex items-center justify-between border-b border-border/30 px-3 py-1.5 text-xs"
          >
            <span className="truncate pr-3">
              {rule.alias || `Rule ${index + 1}`}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`router-rule-${rule.id}`}
              className="!h-2.5 !w-2.5 !border-2 !border-card !bg-violet-500"
            />
          </div>
        ))}
        <div className="relative flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span className="italic">Default</span>
          <Handle
            type="source"
            position={Position.Right}
            id="router-fallback"
            className="!h-2.5 !w-2.5 !border-2 !border-card !bg-violet-500/70"
          />
        </div>
      </div>
    </div>
  );
}
