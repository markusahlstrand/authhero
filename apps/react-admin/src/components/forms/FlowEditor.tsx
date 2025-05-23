import React, { useCallback } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  MarkerType,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Typography, Paper } from "@mui/material";

interface FlowEditorProps {
  nodes: any[];
  start?: any;
  ending?: any;
}

// Custom node styles
const nodeStyles = {
  start: {
    background: "#e6f7ff",
    border: "1px solid #1890ff",
    borderRadius: "8px",
    padding: "10px",
    color: "#0050b3",
    minWidth: "150px",
  },
  step: {
    background: "#f6ffed",
    border: "1px solid #52c41a",
    borderRadius: "8px",
    padding: "10px",
    color: "#135200",
    minWidth: "180px",
  },
  condition: {
    background: "#fff7e6",
    border: "1px solid #faad14",
    borderRadius: "8px",
    padding: "10px",
    color: "#874d00",
    minWidth: "180px",
  },
  end: {
    background: "#fff1f0",
    border: "1px solid #ff4d4f",
    borderRadius: "8px",
    padding: "10px",
    color: "#820014",
    minWidth: "150px",
  },
};

// Custom node data component
const NodeData = ({ data }: { data: any }) => {
  return (
    <Box sx={{ padding: "8px" }}>
      <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
        {data.label}
      </Typography>
      {data.type && (
        <Typography variant="caption" display="block">
          Type: {data.type}
        </Typography>
      )}
      {data.next && (
        <Typography variant="caption" display="block">
          Next: {data.next}
        </Typography>
      )}
      {data.components && (
        <Box>
          <Typography variant="caption" display="block">
            Components: {data.components.length}
          </Typography>
          <Paper
            variant="outlined"
            sx={{ maxHeight: "100px", overflow: "auto", mt: 1, p: 1 }}
          >
            {data.components.map((comp: any) => (
              <Typography key={comp.id} variant="caption" display="block">
                {comp.type}: {comp.id}
              </Typography>
            ))}
          </Paper>
        </Box>
      )}
    </Box>
  );
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
        type: "default",
        position: {
          x: start.coordinates?.x || 100,
          y: start.coordinates?.y || 100,
        },
        data: {
          label: "Start",
          next: start.next_node,
          type: "START",
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
          type: "smoothstep",
        });
      }
    }

    // Add form nodes
    nodes.forEach((node) => {
      const flowNode = {
        id: node.id,
        type: "default",
        position: {
          x: node.coordinates?.x || 200,
          y: node.coordinates?.y || 200,
        },
        data: {
          label: node.alias || node.id,
          type: node.type,
          next: node.config?.next_node,
          components: node.config?.components,
        },
        style: node.type === "STEP" ? nodeStyles.step : nodeStyles.condition,
      };
      flowNodes.push(flowNode);

      // Create edge to the next node
      if (node.config?.next_node) {
        flowEdges.push({
          id: `${node.id}-to-${node.config.next_node}`,
          source: node.id,
          target: node.config.next_node,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          type: "smoothstep",
        });
      }
    });

    // Add ending node if present
    if (ending) {
      const endNode = {
        id: "end",
        type: "default",
        position: {
          x: ending.coordinates?.x || 300,
          y: ending.coordinates?.y || 300,
        },
        data: {
          label: "End",
          resumeFlow: ending.resume_flow ? "Yes" : "No",
          type: "END",
        },
        style: nodeStyles.end,
      };
      flowNodes.push(endNode);
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [nodes, start, ending]);

  const initialElements = createFlowElements();
  const [flowNodes, setNodes, onNodesChange] = useNodesState(
    initialElements.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

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
    <Box sx={{ width: "100%", height: "500px" }}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls />
        <Background color="#aaa" gap={16} />
        <Panel position="top-right">
          <Typography variant="caption">Form Flow Diagram</Typography>
        </Panel>
      </ReactFlow>
    </Box>
  );
};

export default FlowEditor;
