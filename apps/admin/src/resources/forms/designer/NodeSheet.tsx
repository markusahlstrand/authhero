import { Suspense } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";
import { JsonOutput } from "@/common/JsonOutput";

import type { EndingNode, FormNode, StartNode } from "./types";
import { StartEditor } from "./editors/StartEditor";
import { EndEditor } from "./editors/EndEditor";
import { StepEditor } from "./editors/StepEditor";
import { FlowNodeEditor } from "./editors/FlowNodeEditor";
import { RouterEditor } from "./editors/RouterEditor";
import { useNodeOperations } from "./hooks/useNodeOperations";

interface NodeSheetProps {
  selectedNodeId: string | null;
  onClose: () => void;
}

interface SheetBodyProps {
  selectedNodeId: string;
  onClose: () => void;
}

function SheetBody({ selectedNodeId, onClose }: SheetBodyProps) {
  const nodes = (useWatch({ name: "nodes" }) as FormNode[] | undefined) ?? [];
  const start = useWatch({ name: "start" }) as StartNode | undefined;
  const ending = useWatch({ name: "ending" }) as EndingNode | undefined;
  const { removeNode } = useNodeOperations({ nodes, start, ending });

  let title = "";
  let description = "";
  let body: React.ReactNode = null;
  let record: unknown = null;
  let canDelete = false;

  if (selectedNodeId === "start") {
    title = "Start";
    description = "Entry point of the form flow";
    body = <StartEditor />;
    record = start;
  } else if (selectedNodeId === "end") {
    title = "Ending screen";
    description = "Final node of the flow";
    body = <EndEditor />;
    record = ending;
  } else {
    const index = nodes.findIndex((n) => n.id === selectedNodeId);
    if (index >= 0) {
      const node = nodes[index];
      record = node;
      canDelete = true;
      if (node.type === "STEP") {
        title = node.alias || node.id;
        description = "Step node";
        body = <StepEditor index={index} />;
      } else if (node.type === "FLOW") {
        title = node.alias || node.id;
        description = "Flow node";
        body = <FlowNodeEditor index={index} />;
      } else if (node.type === "ROUTER") {
        title = node.alias || node.id;
        description = "Router node";
        body = <RouterEditor index={index} />;
      }
    }
  }

  if (!body) {
    return (
      <div className="px-1 py-6 text-sm text-muted-foreground">
        Node not found.
      </div>
    );
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Tabs defaultValue="properties" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="properties" className="flex-1">
              Properties
            </TabsTrigger>
            <TabsTrigger value="json" className="flex-1">
              JSON
            </TabsTrigger>
          </TabsList>
          <TabsContent value="properties" className="mt-4">
            <Suspense fallback={null}>{body}</Suspense>
          </TabsContent>
          <TabsContent value="json" className="mt-4">
            <JsonOutput data={record} />
          </TabsContent>
        </Tabs>
      </div>
      {canDelete && (
        <SheetFooter className="border-t">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              removeNode(selectedNodeId);
              onClose();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete node
          </Button>
        </SheetFooter>
      )}
    </>
  );
}

export function NodeSheet({ selectedNodeId, onClose }: NodeSheetProps) {
  // Keep the sheet mounted while sliding shut so its inputs don't unmount
  // mid-animation. useFormContext is still available via the parent form.
  useFormContext();
  return (
    <Sheet
      open={selectedNodeId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {selectedNodeId && (
          <SheetBody selectedNodeId={selectedNodeId} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
