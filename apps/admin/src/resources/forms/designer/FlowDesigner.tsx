import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type Connection,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Layers,
  GitBranch,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import { FLOW_CONFIG } from "./constants";
import type { CanvasNodeData, EndingNode, FormNode, StartNode } from "./types";
import { useFlowGraph } from "./hooks/useFlowGraph";
import { useNodeOperations } from "./hooks/useNodeOperations";

import { StartNode as StartNodeComponent } from "./nodes/StartNode";
import { EndNode } from "./nodes/EndNode";
import { StepNode } from "./nodes/StepNode";
import { FlowNode } from "./nodes/FlowNode";
import { RouterNode } from "./nodes/RouterNode";

const nodeTypes = {
  start: StartNodeComponent,
  end: EndNode,
  step: StepNode,
  flow: FlowNode,
  router: RouterNode,
};

export interface FlowDesignerProps {
  nodes: FormNode[];
  start?: StartNode;
  ending?: EndingNode;
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

export function FlowDesigner({
  nodes,
  start,
  ending,
  selectedNodeId,
  onSelect,
}: FlowDesignerProps) {
  const { flowNodes, edges, warnings } = useFlowGraph({ nodes, start, ending });
  const { updateNodeCoordinates, setNextNode, addStep, addFlow, addRouter } =
    useNodeOperations({ nodes, start, ending });

  const [canvasNodes, setCanvasNodes, onNodesChange] =
    useNodesState<Node<CanvasNodeData>>(flowNodes);
  const [canvasEdges, setCanvasEdges, onEdgesChange] =
    useEdgesState<Edge>(edges);

  const previousIdsRef = useRef<string>("");

  useEffect(() => {
    setCanvasNodes(flowNodes);
    const ids = flowNodes
      .map((n) => n.id)
      .sort()
      .join(",");
    previousIdsRef.current = ids;
  }, [flowNodes, setCanvasNodes]);

  useEffect(() => {
    setCanvasEdges(edges);
  }, [edges, setCanvasEdges]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onSelect(node.id);
    },
    [onSelect],
  );

  const handlePaneClick = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      updateNodeCoordinates(node.id, node.position.x, node.position.y);
    },
    [updateNodeCoordinates],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setNextNode(
        connection.source,
        connection.sourceHandle,
        connection.target,
      );
    },
    [setNextNode],
  );

  const orphanCount = useMemo(
    () => flowNodes.filter((n) => n.data.orphaned).length,
    [flowNodes],
  );

  const canvasNodesWithSelection = useMemo(
    () =>
      canvasNodes.map((node) =>
        node.selected === (node.id === selectedNodeId)
          ? node
          : { ...node, selected: node.id === selectedNodeId },
      ),
    [canvasNodes, selectedNodeId],
  );

  return (
    <div className="relative h-[calc(100vh-12rem)] min-h-[480px] w-full overflow-hidden rounded-lg border bg-muted/30">
      <ReactFlow
        nodes={canvasNodesWithSelection}
        edges={canvasEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FLOW_CONFIG.fitViewOptions}
        minZoom={FLOW_CONFIG.minZoom}
        maxZoom={FLOW_CONFIG.maxZoom}
        proOptions={{ hideAttribution: true }}
        elementsSelectable
        nodesDraggable
        nodesConnectable
      >
        <Background gap={16} size={1} className="!bg-transparent" />
        <Controls className="!shadow-md" />

        <Panel position="top-right">
          <Card className="flex flex-col gap-1 p-3 text-xs shadow-md">
            <div className="font-medium text-foreground">Flow overview</div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{flowNodes.length} nodes</span>
              <span>·</span>
              <span>{canvasEdges.length} edges</span>
            </div>
            {orphanCount > 0 && (
              <Badge
                variant="outline"
                className="mt-1 gap-1 border-amber-500/60 text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" />
                {orphanCount} orphan{orphanCount === 1 ? "" : "s"}
              </Badge>
            )}
            {warnings.length > 0 && orphanCount === 0 && (
              <Badge variant="outline" className="mt-1 gap-1">
                <AlertTriangle className="h-3 w-3" />
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </Badge>
            )}
          </Card>
        </Panel>

        <Panel position="bottom-center">
          <Card className="flex items-center gap-2 px-3 py-1.5 shadow-md">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              Add
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelect(addStep())}
              >
                <Layers className="h-3.5 w-3.5" />
                Step
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelect(addRouter())}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Router
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelect(addFlow())}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Flow
              </Button>
            </div>
          </Card>
        </Panel>
      </ReactFlow>
    </div>
  );
}
