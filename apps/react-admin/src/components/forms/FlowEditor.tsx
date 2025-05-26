import React, { useCallback } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Typography } from "@mui/material";

interface FlowEditorProps {
  nodes: any[];
  start?: any;
  ending?: any;
}

// Custom node styles
const nodeStyles = {
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
};

// Custom node types
const nodeTypes = {
  start: ({ data }: { data: any }) => (
    <Box sx={{ padding: "8px" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
        Start
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {data.next && `Next: ${data.next}`}
      </Typography>
    </Box>
  ),
  step: ({ data }: { data: any }) => (
    <Box sx={{ padding: "8px" }}>
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
            }}
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
            }}
          >
            ✕
          </Box>
        </Box>
      </Box>

      {data.components && (
        <Box sx={{ mt: 1 }}>
          {data.components.map((comp: any) => (
            <Box
              key={comp.id}
              sx={{
                py: 0.5,
                borderBottom:
                  comp.type === "NEXT_BUTTON" ? "none" : "1px solid #f0f0f0",
              }}
            >
              {comp.type === "RICH_TEXT" && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {comp.config?.content
                    ? "Text content: " +
                      comp.config.content
                        .replace(/<[^>]*>/g, "")
                        .substring(0, 20) +
                      "..."
                    : "Rich text"}
                </Typography>
              )}
              {comp.type === "LEGAL" && (
                <Typography variant="body2" color="text.secondary">
                  {comp.config?.text
                    ? "Legal: " +
                      comp.config.text
                        .replace(/<[^>]*>/g, "")
                        .substring(0, 20) +
                      "..."
                    : "Legal checkbox"}
                </Typography>
              )}
              {comp.type === "NEXT_BUTTON" && (
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
                  {comp.config?.text || "Continue"}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  ),
  flow: ({ data }: { data: any }) => (
    <Box sx={{ padding: "8px" }}>
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
        >
          ⟳
        </Box>
        <Typography variant="body2" color="text.secondary">
          {data.flowId ? `Update ${data.flowId}` : "Update metadata"}
        </Typography>
      </Box>
    </Box>
  ),
  end: ({ data }: { data: any }) => (
    <Box sx={{ padding: "8px" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
        Ending screen
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {data.resumeFlow ? "Resume authentication flow" : "End flow"}
      </Typography>
    </Box>
  ),
};

const FlowEditor: React.FC<FlowEditorProps> = ({
  nodes = [],
  start,
  ending,
}) => {
  // Transform the data into ReactFlow nodes and edges
  const createFlowElements = useCallback(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Add start node if present
    if (start) {
      const startNode = {
        id: "start",
        type: "start",
        position: {
          x: start.coordinates?.x || 100,
          y: start.coordinates?.y || 100,
        },
        data: {
          next: start.next_node,
        },
        style: nodeStyles.start,
      };
      flowNodes.push(startNode);

      // Create edge from start to its next node
      if (start.next_node) {
        flowEdges.push({
          id: `start-to-${start.next_node}`,
          source: "start",
          target: start.next_node,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          animated: false,
          type: "smoothstep",
          style: { stroke: "#999", strokeWidth: 1 },
        });
      }
    }

    // Add form nodes
    nodes.forEach((node) => {
      // Determine node type based on the node.type in the data
      let nodeType = "step";
      if (node.type === "FLOW") {
        nodeType = "flow";
      }

      const flowNode = {
        id: node.id,
        type: nodeType,
        position: {
          x: node.coordinates?.x || 200,
          y: node.coordinates?.y || 200,
        },
        data: {
          label: node.alias || node.id,
          type: node.type,
          next: node.config?.next_node,
          components: node.config?.components,
          flowId: node.config?.flow_id,
        },
        style: node.type === "STEP" ? nodeStyles.step : nodeStyles.flow,
      };
      flowNodes.push(flowNode);

      // Create edge to the next node
      if (node.config?.next_node) {
        const target =
          node.config.next_node === "$ending" ? "end" : node.config.next_node;
        flowEdges.push({
          id: `${node.id}-to-${target}`,
          source: node.id,
          target: target,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          animated: false,
          type: "smoothstep",
          style: { stroke: "#999", strokeWidth: 1 },
        });
      }
    });

    // Add ending node if present
    if (ending) {
      const endNode = {
        id: "end",
        type: "end",
        position: {
          x: ending.coordinates?.x || 300,
          y: ending.coordinates?.y || 300,
        },
        data: {
          resumeFlow: ending.resume_flow ? "Yes" : "No",
        },
        style: nodeStyles.end,
      };
      flowNodes.push(endNode);
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [nodes, start, ending]);

  const initialElements = createFlowElements();
  const [flowNodes, , onNodesChange] = useNodesState(initialElements.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initialElements.edges);

  // Fallback display for when ReactFlow cannot be initialized properly
  if (flowNodes.length === 0) {
    return (
      <Box sx={{ padding: "20px" }}>
        <Typography variant="h6">Flow Structure</Typography>
        <Typography>No flow elements to display</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "600px" }}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        attributionPosition="bottom-left"
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
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Form Flow Diagram
            </Typography>
          </Box>
        </Panel>
      </ReactFlow>
    </Box>
  );
};

export default FlowEditor;
