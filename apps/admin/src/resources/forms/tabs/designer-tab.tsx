import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useWatch } from "react-hook-form";

import { FlowDesigner } from "../designer/FlowDesigner";
import { NodeSheet } from "../designer/NodeSheet";
import type {
  EndingNode,
  FormNode,
  StartNode,
} from "../designer/types";

export function DesignerTab() {
  const nodes = (useWatch({ name: "nodes" }) as FormNode[] | undefined) ?? [];
  const start = useWatch({ name: "start" }) as StartNode | undefined;
  const ending = useWatch({ name: "ending" }) as EndingNode | undefined;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <ReactFlowProvider>
      <FlowDesigner
        nodes={nodes}
        start={start}
        ending={ending}
        selectedNodeId={selectedNodeId}
        onSelect={setSelectedNodeId}
      />
      <NodeSheet
        selectedNodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
      />
    </ReactFlowProvider>
  );
}

export default DesignerTab;
