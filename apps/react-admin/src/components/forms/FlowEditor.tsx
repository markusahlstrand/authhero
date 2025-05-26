import React, { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Panel,
  NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Typography, Alert } from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";

// Import the NodeEditor component
import NodeEditor from "./NodeEditor";

// Type definitions
export interface ComponentConfig {
  id: string;
  type: "RICH_TEXT" | "LEGAL" | "NEXT_BUTTON";
  config?: {
    content?: string;
    text?: string;
  };
}

export interface FlowNodeData {
  id: string;
  type: "STEP" | "FLOW";
  alias?: string;
  coordinates?: { x: number; y: number };
  config?: {
    next_node?: string;
    components?: ComponentConfig[];
    flow_id?: string;
  };
}

export interface StartNode {
  next_node?: string;
  coordinates?: { x: number; y: number };
}

export interface EndingNode {
  resume_flow?: boolean;
  coordinates?: { x: number; y: number };
}

export interface FlowEditorProps {
  nodes: FlowNodeData[];
  start?: StartNode;
  ending?: EndingNode;
  onNodeSelect?: (nodeId: string) => void;
  onNodeUpdate?: (
    nodeId: string,
    updates: Partial<FlowNodeData> | Partial<StartNode> | Partial<EndingNode>,
  ) => void;
  onError?: (error: string) => void;
}

interface CustomNodeData extends Record<string, unknown> {
  label?: string;
  type?: string;
  next?: string;
  components?: ComponentConfig[];
  flowId?: string;
  orphaned?: boolean;
  invalidConnection?: boolean;
  resumeFlow?: string;
}

// Constants moved outside component
const NODE_STYLES = {
  start: {
    background: "#f5f5f5",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    padding: "12px",
    color: "#424242",
    minWidth: "180px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  step: {
    background: "#ffffff",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    padding: "12px",
    color: "#424242",
    minWidth: "280px",
    maxWidth: "320px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  flow: {
    background: "#f8f9fa",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    padding: "12px",
    color: "#424242",
    minWidth: "180px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  end: {
    background: "#f5f5f5",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    padding: "12px",
    color: "#424242",
    minWidth: "180px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
} as const;

const DEFAULT_EDGE_OPTIONS = {
  type: "smoothstep" as const,
  animated: true,
  style: { stroke: "#1976d2", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
  },
};

const FLOW_CONFIG = {
  fitViewOptions: { padding: 0.2 },
  minZoom: 0.5,
  maxZoom: 1.5,
} as const;

// Utility functions
const truncateText = (text: string, maxLength: number = 20): string => {
  const cleanText = text.replace(/<[^>]*>/g, "");
  return cleanText.length > maxLength
    ? `${cleanText.substring(0, maxLength)}...`
    : cleanText;
};

const getNodePosition = (
  coordinates?: { x: number; y: number },
  defaultX: number = 200,
  defaultY: number = 200,
) => ({
  x: coordinates?.x ?? defaultX,
  y: coordinates?.y ?? defaultY,
});

// Custom Node Components
const StartNodeComponent = React.memo(({ data }: { data: CustomNodeData }) => (
  <Box sx={{ padding: "8px" }}>
    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
      Start
    </Typography>
    <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        component="span"
        sx={{
          width: 18,
          height: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #4CAF50",
          borderRadius: "50%",
          color: "#4CAF50",
          fontSize: "14px",
        }}
        aria-label="Start node indicator"
      >
        ▶
      </Box>
      <Typography variant="body2" color="text.secondary">
        {data.next ? `Next: ${data.next}` : "No connection"}
      </Typography>
    </Box>
    <Handle
      type="source"
      position={Position.Right}
      id="start-output"
      style={{ background: "#4CAF50" }}
    />
  </Box>
));

const ComponentRenderer = React.memo(
  ({ component }: { component: ComponentConfig }) => {
    switch (component.type) {
      case "RICH_TEXT":
        return (
          <Box
            sx={{
              backgroundColor: "#f8f9fa",
              p: 1,
              borderRadius: "4px",
              position: "relative",
            }}
          >
            <Box
              component="span"
              sx={{
                position: "absolute",
                top: 0,
                right: 0,
                fontSize: "16px",
                color: "#1976d2",
                p: 0.5,
              }}
            >
              <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
            </Box>
            <Typography
              variant="body2"
              sx={{
                "& u": {
                  textDecoration: "underline",
                  color: "#1976d2",
                  cursor: "pointer",
                },
              }}
            >
              {component.config?.content
                ? truncateText(component.config.content, 60)
                : "Rich text content"}
            </Typography>
          </Box>
        );

      case "LEGAL":
        return (
          <Typography variant="body2" color="text.secondary">
            {component.config?.text
              ? `Legal: ${truncateText(component.config.text)}`
              : "Legal checkbox"}
          </Typography>
        );

      case "NEXT_BUTTON":
        return (
          <Box
            sx={{
              mt: 1,
              p: 1,
              textAlign: "center",
              bgcolor: "#1976d2",
              color: "white",
              borderRadius: "4px",
              fontSize: "14px",
            }}
          >
            {component.config?.text || "Continue"}
          </Box>
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            Unknown component: {component.type}
          </Typography>
        );
    }
  },
);

const StepNodeComponent = React.memo(({ data }: { data: CustomNodeData }) => (
  <Box sx={{ padding: "8px" }}>
    <Handle
      type="target"
      position={Position.Left}
      id="step-input"
      style={{ background: "#1976d2" }}
    />

    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        mb: 1,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
        {data.label || "Step"}
      </Typography>
      <Box sx={{ display: "flex", gap: "4px" }}>
        <Box
          component="span"
          sx={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #ddd",
            borderRadius: "2px",
            fontSize: "12px",
            color: "#666",
            cursor: "pointer",
          }}
          title="Copy step"
          role="button"
          tabIndex={0}
        >
          ⎘
        </Box>
        <Box
          component="span"
          sx={{
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #ddd",
            borderRadius: "2px",
            fontSize: "12px",
            color: "#666",
            cursor: "pointer",
          }}
          title="Delete step"
          role="button"
          tabIndex={0}
        >
          ✕
        </Box>
      </Box>
    </Box>

    {data.components && data.components.length > 0 && (
      <Box sx={{ mt: 1 }}>
        {data.components.map((comp) => (
          <Box
            key={comp.id}
            sx={{
              py: 0.5,
              borderBottom:
                comp.type === "NEXT_BUTTON" ? "none" : "1px solid #f0f0f0",
            }}
          >
            <ComponentRenderer component={comp} />
          </Box>
        ))}
      </Box>
    )}

    {data.next && (
      <Box sx={{ mt: 1, borderTop: "1px dashed #ddd", pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Next: {data.next === "$ending" ? "End" : data.next}
        </Typography>
      </Box>
    )}

    <Handle
      type="source"
      position={Position.Right}
      id="step-output"
      style={{ background: "#1976d2" }}
    />
  </Box>
));

const FlowNodeComponent = React.memo(({ data }: { data: CustomNodeData }) => (
  <Box sx={{ padding: "8px" }}>
    <Handle
      type="target"
      position={Position.Left}
      id="flow-input"
      style={{ background: "#1976d2" }}
    />

    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
        Flow
      </Typography>
    </Box>
    <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        component="span"
        sx={{
          width: 24,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #1976d2",
          borderRadius: "50%",
          color: "#1976d2",
          fontSize: "16px",
        }}
        aria-label="Flow update indicator"
      >
        ⟳
      </Box>
      <Typography variant="body2" color="text.secondary">
        {data.flowId ? `Update ${data.flowId}` : "Update metadata"}
      </Typography>
    </Box>

    {data.next && (
      <Box sx={{ mt: 1, borderTop: "1px dashed #ddd", pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Next: {data.next === "$ending" ? "End" : data.next}
        </Typography>
      </Box>
    )}

    <Handle
      type="source"
      position={Position.Right}
      id="flow-output"
      style={{ background: "#1976d2" }}
    />
  </Box>
));

const EndNodeComponent = React.memo(({ data }: { data: CustomNodeData }) => (
  <Box sx={{ padding: "8px" }}>
    <Handle
      type="target"
      position={Position.Left}
      id="end-input"
      style={{ background: "#f44336" }}
    />

    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
      Ending screen
    </Typography>
    <Typography variant="body2" color="text.secondary">
      {data.resumeFlow === "Yes" ? "Resume authentication flow" : "End flow"}
    </Typography>
  </Box>
));

// Node types configuration
const nodeTypes: NodeTypes = {
  start: StartNodeComponent,
  step: StepNodeComponent,
  flow: FlowNodeComponent,
  end: EndNodeComponent,
};

const FlowEditor: React.FC<FlowEditorProps> = ({
  nodes = [],
  start,
  ending,
  onNodeSelect,
  onNodeUpdate,
  onError,
}) => {
  // State for node selection and editor
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Memoized flow elements creation
  const {
    flowNodes: initialNodes,
    edges: initialEdges,
    warnings,
  } = useMemo(() => {
    const flowNodes: Node<CustomNodeData>[] = [];
    const flowEdges: Edge[] = [];
    const warnings: string[] = [];

    try {
      // Add ending node if present (move this up)
      if (ending) {
        const endNode: Node<CustomNodeData> = {
          id: "end",
          type: "end",
          position: getNodePosition(
            ending.coordinates,
            flowNodes.length * 350 + 250,
            200,
          ),
          data: {
            resumeFlow: ending.resume_flow ? "Yes" : "No",
          },
          style: NODE_STYLES.end,
        };
        flowNodes.push(endNode);
      }

      // Add start node if present
      if (start) {
        const startNode: Node<CustomNodeData> = {
          id: "start",
          type: "start",
          position: getNodePosition(start.coordinates, 100, 100),
          data: {
            next: start.next_node,
          },
          style: NODE_STYLES.start,
        };
        flowNodes.push(startNode);

        // Create edge from start to its next node
        if (start.next_node) {
          let target = start.next_node;
          let targetHandle = "step-input";
          if (start.next_node === "$ending") {
            target = "end";
            targetHandle = "end-input";
          } else {
            // Determine if the target is a step or flow node
            const targetNodeType = nodes.find(
              (n) => n.id === start.next_node,
            )?.type;
            targetHandle =
              targetNodeType === "FLOW" ? "flow-input" : "step-input";
          }

          flowEdges.push({
            id: `start-to-${target}`,
            source: "start",
            sourceHandle: "start-output",
            target: target,
            targetHandle: targetHandle,
            type: "smoothstep",
            animated: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            style: { stroke: "#1976d2", strokeWidth: 2 },
            label: start.next_node === "$ending" ? "End" : undefined,
          });
        }
      }

      // Add form nodes
      nodes.forEach((node, index) => {
        if (!node.id) {
          warnings.push(`Node at index ${index} missing required id`);
          return;
        }

        const nodeType = node.type === "FLOW" ? "flow" : "step";
        const defaultX = 250 + index * 350;

        const flowNode: Node<CustomNodeData> = {
          id: node.id,
          type: nodeType,
          position: getNodePosition(node.coordinates, defaultX, 200),
          data: {
            label: node.alias || node.id,
            type: node.type,
            next: node.config?.next_node,
            components: node.config?.components || [],
            flowId: node.config?.flow_id,
          },
          style: node.type === "STEP" ? NODE_STYLES.step : NODE_STYLES.flow,
        };
        flowNodes.push(flowNode);

        // Create edge to the next node
        if (node.config?.next_node) {
          const target =
            node.config.next_node === "$ending" ? "end" : node.config.next_node;
          const edgeId = `${node.id}-to-${target}`;

          // Determine source and target handles
          const sourceHandle =
            node.type === "STEP" ? "step-output" : "flow-output";
          let targetHandle = "end-input";
          if (target !== "end") {
            // Find the target node to determine its type for the correct handle
            const targetNode = nodes.find((n) => n.id === target);
            targetHandle =
              targetNode?.type === "FLOW" ? "flow-input" : "step-input";
          }

          // Validate that target exists or will exist
          const targetExists =
            target === "end" ||
            nodes.some((n) => n.id === target) ||
            (start && start.next_node === target);

          if (targetExists || target === "end") {
            flowEdges.push({
              id: edgeId,
              source: node.id,
              sourceHandle: sourceHandle,
              target: target,
              targetHandle: targetHandle,
              type: "smoothstep",
              animated: true,
              markerEnd: {
                type: MarkerType.ArrowClosed,
              },
              style: { stroke: "#1976d2", strokeWidth: 2 },
              label: node.config.next_node === "$ending" ? "End" : undefined,
            });
          } else {
            warnings.push(
              `Target node ${target} not found for edge from ${node.id}`,
            );
          }
        }
      });

      // Validation logic
      const connectedNodeIds = new Set<string>();
      flowEdges.forEach((edge) => {
        connectedNodeIds.add(edge.target);
      });

      const allNodeIds = new Set(flowNodes.map((node) => node.id));

      // Mark orphaned and invalid nodes
      flowNodes.forEach((node) => {
        // Check for orphaned nodes
        if (
          node.id !== "start" &&
          node.id !== "end" &&
          !connectedNodeIds.has(node.id)
        ) {
          node.data.orphaned = true;
          node.style = {
            ...node.style,
            border: "2px dashed #f44336",
            boxShadow: "0 0 5px rgba(244, 67, 54, 0.5)",
          };
          warnings.push(`Orphaned node: ${node.id}`);
        }

        // Check for invalid connections
        if (
          node.data.next &&
          node.data.next !== "$ending" &&
          !allNodeIds.has(node.data.next)
        ) {
          node.data.invalidConnection = true;
          node.style = {
            ...node.style,
            borderBottom: "3px solid #FF9800",
            boxShadow: "0 2px 4px rgba(255, 152, 0, 0.5)",
          };
          warnings.push(
            `Invalid connection in ${node.id}: ${node.data.next} not found`,
          );
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      warnings.push(`Error creating flow: ${errorMessage}`);
      onError?.(errorMessage);
    }

    return { flowNodes, edges: flowEdges, warnings };
  }, [nodes, start, ending, onError]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes and edges state with initial values when they change
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setIsEditorOpen(true);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  // Close the editor
  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  // Handle node updates from the editor
  const handleNodeUpdate = useCallback(
    (
      nodeId: string,
      updates: Partial<FlowNodeData> | Partial<StartNode> | Partial<EndingNode>,
    ) => {
      onNodeUpdate?.(nodeId, updates);
    },
    [onNodeUpdate],
  );

  // Find the selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return flowNodes.find((node) => node.id === selectedNodeId) || null;
  }, [selectedNodeId, flowNodes]);

  // Statistics
  const stats = useMemo(() => {
    const orphanedCount = flowNodes.filter(
      (node) => node.data?.orphaned,
    ).length;
    const invalidConnectionsCount = flowNodes.filter(
      (node) => node.data?.invalidConnection,
    ).length;

    return { orphanedCount, invalidConnectionsCount };
  }, [flowNodes]);

  // Error handling for empty flow
  if (flowNodes.length === 0) {
    return (
      <Box sx={{ padding: "20px" }}>
        <Alert severity="info">
          <Typography variant="h6">No Flow Elements</Typography>
          <Typography>
            No flow elements available to display. Please provide nodes, start,
            or ending configuration.
          </Typography>
        </Alert>
      </Box>
    );
  }

  // Add Step handler
  const handleAddStep = useCallback(() => {
    // Generate a short random id (4 alphanumeric chars)
    const randomId = () => Math.random().toString(36).slice(2, 6);
    const stepId = `step_${randomId()}`;
    const nextButtonId = `next_button_${randomId()}`;
    const newStep: FlowNodeData = {
      id: stepId,
      type: "STEP",
      coordinates: { x: 620, y: -106 },
      alias: "New step",
      config: {
        components: [
          {
            id: nextButtonId,
            type: "NEXT_BUTTON",
            config: { text: "Continue" },
          },
        ],
      },
    };
    onNodeUpdate?.(stepId, newStep);
  }, [onNodeUpdate]);

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">Flow Validation Warnings:</Typography>
          <ul>
            {warnings.slice(0, 5).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          {warnings.length > 5 && (
            <Typography variant="caption">
              ... and {warnings.length - 5} more warnings
            </Typography>
          )}
        </Alert>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FLOW_CONFIG.fitViewOptions}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        elementsSelectable={true}
        nodesDraggable={true}
        minZoom={FLOW_CONFIG.minZoom}
        maxZoom={FLOW_CONFIG.maxZoom}
        attributionPosition="bottom-left"
        style={{ height: "100%" }}
      >
        <Controls showInteractive={false} />
        <Background color="#f0f0f0" gap={12} size={1} />
        <Panel position="top-right">
          <Box
            sx={{
              p: 1,
              bgcolor: "white",
              borderRadius: "4px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              minWidth: 160,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Form Flow Diagram
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
              Nodes: {flowNodes.length} | Edges: {edges.length}
            </Typography>

            {stats.orphanedCount > 0 && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "#f44336",
                  mt: 0.5,
                }}
              >
                ⚠ {stats.orphanedCount} unconnected node
                {stats.orphanedCount > 1 ? "s" : ""}
              </Typography>
            )}

            {stats.invalidConnectionsCount > 0 && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "#FF9800",
                  mt: 0.5,
                }}
              >
                ⚠ {stats.invalidConnectionsCount} invalid connection
                {stats.invalidConnectionsCount > 1 ? "s" : ""}
              </Typography>
            )}
          </Box>
        </Panel>
      </ReactFlow>

      {/* Bottom center add buttons */}
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          bottom: 12,
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          bgcolor: "white",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          px: 1.5,
          py: 0.5,
          gap: 1,
        }}
      >
        <AddCircleOutlineIcon sx={{ color: "#1976d2", mr: 1 }} />
        <Box sx={{ display: "flex", gap: 1 }}>
          <button
            type="button"
            style={{
              border: "1px solid #e0e0e0",
              background: "#fff",
              borderRadius: 6,
              padding: "4px 16px",
              fontWeight: 500,
              fontSize: 15,
              color: "#424242",
              cursor: "pointer",
              outline: "none",
              transition: "background 0.2s, border 0.2s",
            }}
            onClick={handleAddStep}
          >
            Step
          </button>
          <button
            type="button"
            style={{
              border: "1px solid #e0e0e0",
              background: "#fff",
              borderRadius: 6,
              padding: "4px 16px",
              fontWeight: 500,
              fontSize: 15,
              color: "#424242",
              cursor: "pointer",
              outline: "none",
              transition: "background 0.2s, border 0.2s",
            }}
            // onClick={handleAddRouter}
          >
            Router
          </button>
          <button
            type="button"
            style={{
              border: "1px solid #e0e0e0",
              background: "#fff",
              borderRadius: 6,
              padding: "4px 16px",
              fontWeight: 500,
              fontSize: 15,
              color: "#424242",
              cursor: "pointer",
              outline: "none",
              transition: "background 0.2s, border 0.2s",
            }}
            // onClick={handleAddFlow}
          >
            Flow
          </button>
        </Box>
      </Box>

      {/* Node Editor */}
      <NodeEditor
        open={isEditorOpen}
        selectedNode={selectedNode}
        nodes={nodes}
        start={start}
        ending={ending}
        onClose={handleCloseEditor}
        onNodeUpdate={handleNodeUpdate}
      />
    </Box>
  );
};

export default FlowEditor;
