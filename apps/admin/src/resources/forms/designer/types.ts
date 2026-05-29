import type {
  FormNode,
  FormNodeComponent,
  FlowNode,
  RouterNode,
  StepNode,
} from "@authhero/adapter-interfaces";

export type { FormNode, FormNodeComponent, FlowNode, RouterNode, StepNode };

export interface Coordinates {
  x: number;
  y: number;
}

export interface StartNode {
  hidden_fields?: Array<{ key: string; value: string }>;
  next_node?: string;
  coordinates?: Coordinates;
}

export interface EndingNode {
  redirection?: { delay?: number; target?: string };
  after_submit?: { flow_id?: string };
  coordinates?: Coordinates;
  resume_flow?: boolean;
}

export type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "exists"
  | "not_exists";

export interface RouterCondition {
  field?: string;
  operator?: Operator;
  value?: string;
}

export interface RouterConditionGroup {
  conditions: RouterCondition[];
}

export interface RouterRule {
  id: string;
  alias?: string;
  condition: RouterConditionGroup | unknown;
  next_node: string;
}

export interface DropdownOption {
  label: string;
  value: string;
}

export interface FlowChoice {
  id: string;
  name: string;
}

export type CanvasNodeKind = "start" | "step" | "flow" | "router" | "end";

export interface CanvasNodeData extends Record<string, unknown> {
  kind: CanvasNodeKind;
  label?: string;
  flowId?: string;
  resumeFlow?: boolean;
  components?: FormNodeComponent[];
  rules?: RouterRule[];
  fallback?: string;
  orphaned?: boolean;
  invalidConnection?: boolean;
}

export const isRouterConditionGroup = (
  value: unknown,
): value is RouterConditionGroup => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { conditions?: unknown };
  return Array.isArray(candidate.conditions);
};
