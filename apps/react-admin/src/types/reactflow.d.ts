declare module "reactflow" {
  export interface NodeProps {
    id: string;
    data: any;
    position: { x: number; y: number };
    type?: string;
    className?: string;
    style?: React.CSSProperties;
  }

  export interface EdgeProps {
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
    animated?: boolean;
    style?: React.CSSProperties;
  }

  export interface NodeChange {
    id: string;
    type: string;
    position?: { x: number; y: number };
    // Add other properties as needed
  }

  export interface EdgeChange {
    id: string;
    type: string;
    // Add other properties as needed
  }

  export type Node = NodeProps;
  export type Edge = EdgeProps;

  export enum ConnectionLineType {
    Bezier = "bezier",
    Step = "step",
    SmoothStep = "smoothstep",
    Straight = "straight",
  }

  export function applyNodeChanges(
    changes: NodeChange[],
    nodes: Node[],
  ): Node[];
  export function applyEdgeChanges(
    changes: EdgeChange[],
    edges: Edge[],
  ): Edge[];

  // Define ReactFlow component
  export interface ReactFlowProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange?: (changes: NodeChange[]) => void;
    onEdgesChange?: (changes: EdgeChange[]) => void;
    onConnect?: (connection: any) => void;
    nodeTypes?: Record<string, React.ComponentType<any>>;
    edgeTypes?: Record<string, React.ComponentType<any>>;
    connectionLineType?: ConnectionLineType;
    fitView?: boolean;
    children?: React.ReactNode;
  }

  // Export ReactFlowProvider component
  export const ReactFlowProvider: React.FC<{ children: React.ReactNode }>;

  // Export the Controls component
  export const Controls: React.FC<any>;

  // Export the Background component
  export const Background: React.FC<any>;

  // Default export
  const ReactFlow: React.FC<ReactFlowProps>;
  export default ReactFlow;
}
