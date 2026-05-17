import { useMemo } from "react";
import { type Edge, type Node, MarkerType } from "@xyflow/react";

import { ENDING_TARGET, EDGE_COLORS } from "../constants";
import type {
  CanvasNodeData,
  EndingNode,
  FormNode,
  RouterRule,
  StartNode,
} from "../types";

const getCoord = (
  coordinates: { x: number; y: number } | undefined,
  fallbackX: number,
  fallbackY: number,
) => ({
  x: coordinates?.x ?? fallbackX,
  y: coordinates?.y ?? fallbackY,
});

const targetHandleFor = (target: string, nodes: FormNode[]): string => {
  if (target === "end") return "end-input";
  const node = nodes.find((n) => n.id === target);
  if (!node) return "step-input";
  if (node.type === "FLOW") return "flow-input";
  if (node.type === "ROUTER") return "router-input";
  return "step-input";
};

interface BuildArgs {
  nodes: FormNode[];
  start?: StartNode;
  ending?: EndingNode;
}

export interface BuildResult {
  flowNodes: Node<CanvasNodeData>[];
  edges: Edge[];
  warnings: string[];
}

export function useFlowGraph({ nodes, start, ending }: BuildArgs): BuildResult {
  return useMemo(() => {
    const flowNodes: Node<CanvasNodeData>[] = [];
    const edges: Edge[] = [];
    const warnings: string[] = [];

    if (start) {
      flowNodes.push({
        id: "start",
        type: "start",
        position: getCoord(start.coordinates, 80, 200),
        data: { kind: "start", label: "Start" },
      });
    }

    if (ending) {
      flowNodes.push({
        id: "end",
        type: "end",
        position: getCoord(
          ending.coordinates,
          80 + (nodes.length + 1) * 340,
          200,
        ),
        data: {
          kind: "end",
          label: "Ending",
          resumeFlow: !!ending.resume_flow,
        },
      });
    }

    nodes.forEach((node, idx) => {
      if (!node.id) {
        warnings.push(`Node at index ${idx} is missing an id`);
        return;
      }
      const baseX = 80 + (idx + 1) * 340;
      if (node.type === "STEP") {
        flowNodes.push({
          id: node.id,
          type: "step",
          position: getCoord(node.coordinates, baseX, 200),
          data: {
            kind: "step",
            label: node.alias || node.id,
            components: node.config?.components ?? [],
          },
        });
      } else if (node.type === "FLOW") {
        flowNodes.push({
          id: node.id,
          type: "flow",
          position: getCoord(node.coordinates, baseX, 200),
          data: {
            kind: "flow",
            label: node.alias || node.id,
            flowId: node.config?.flow_id,
          },
        });
      } else if (node.type === "ROUTER") {
        flowNodes.push({
          id: node.id,
          type: "router",
          position: getCoord(node.coordinates, baseX, 200),
          data: {
            kind: "router",
            label: node.alias || node.id,
            rules: (node.config?.rules ?? []) as RouterRule[],
            fallback: node.config?.fallback,
          },
        });
      }
    });

    if (start?.next_node) {
      const target =
        start.next_node === ENDING_TARGET ? "end" : start.next_node;
      edges.push({
        id: `start-to-${target}`,
        source: "start",
        sourceHandle: "start-output",
        target,
        targetHandle: targetHandleFor(target, nodes),
        type: "smoothstep",
        animated: true,
        style: { stroke: EDGE_COLORS.primary, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.primary },
      });
    }

    nodes.forEach((node) => {
      if (node.type === "ROUTER") {
        const rules = (node.config?.rules ?? []) as RouterRule[];
        rules.forEach((rule) => {
          if (!rule.next_node) return;
          const target =
            rule.next_node === ENDING_TARGET ? "end" : rule.next_node;
          edges.push({
            id: `${node.id}-rule-${rule.id}-to-${target}`,
            source: node.id,
            sourceHandle: `router-rule-${rule.id}`,
            target,
            targetHandle: targetHandleFor(target, nodes),
            type: "smoothstep",
            animated: true,
            style: { stroke: EDGE_COLORS.router, strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: EDGE_COLORS.router,
            },
            label: rule.alias || undefined,
          });
        });
        if (node.config?.fallback) {
          const target =
            node.config.fallback === ENDING_TARGET
              ? "end"
              : node.config.fallback;
          edges.push({
            id: `${node.id}-fallback-to-${target}`,
            source: node.id,
            sourceHandle: "router-fallback",
            target,
            targetHandle: targetHandleFor(target, nodes),
            type: "smoothstep",
            animated: true,
            style: {
              stroke: EDGE_COLORS.router,
              strokeWidth: 2,
              strokeDasharray: "5 5",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: EDGE_COLORS.router,
            },
            label: "Default",
          });
        }
      } else if (node.config?.next_node) {
        const target =
          node.config.next_node === ENDING_TARGET
            ? "end"
            : node.config.next_node;
        const targetExists =
          target === "end" || nodes.some((n) => n.id === target);
        if (!targetExists) {
          warnings.push(
            `Node ${node.id} points to missing target "${node.config.next_node}"`,
          );
          return;
        }
        edges.push({
          id: `${node.id}-to-${target}`,
          source: node.id,
          sourceHandle: node.type === "FLOW" ? "flow-output" : "step-output",
          target,
          targetHandle: targetHandleFor(target, nodes),
          type: "smoothstep",
          animated: true,
          style: { stroke: EDGE_COLORS.primary, strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: EDGE_COLORS.primary,
          },
        });
      }
    });

    const incoming = new Set<string>();
    edges.forEach((e) => incoming.add(e.target));
    flowNodes.forEach((n) => {
      if (n.id !== "start" && n.id !== "end" && !incoming.has(n.id)) {
        n.data.orphaned = true;
        warnings.push(`Node "${n.id}" has no incoming connection`);
      }
    });

    return { flowNodes, edges, warnings };
  }, [nodes, start, ending]);
}
