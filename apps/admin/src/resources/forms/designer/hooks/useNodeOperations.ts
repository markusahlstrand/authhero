import { useCallback } from "react";
import { useFormContext } from "react-hook-form";

import { ENDING_TARGET, randomId } from "../constants";
import type { NextButtonComponent } from "@authhero/adapter-interfaces";
import type {
  EndingNode,
  FormNode,
  FormNodeComponent,
  RouterRule,
  StartNode,
} from "../types";

interface UseNodeOperationsArgs {
  nodes: FormNode[];
  start?: StartNode;
  ending?: EndingNode;
}

export function useNodeOperations({
  nodes,
  start,
  ending,
}: UseNodeOperationsArgs) {
  const { setValue } = useFormContext();

  const writeNodes = useCallback(
    (next: FormNode[]) =>
      setValue("nodes", next, { shouldDirty: true, shouldTouch: true }),
    [setValue],
  );
  const writeStart = useCallback(
    (next: StartNode) =>
      setValue("start", next, { shouldDirty: true, shouldTouch: true }),
    [setValue],
  );
  const writeEnding = useCallback(
    (next: EndingNode) =>
      setValue("ending", next, { shouldDirty: true, shouldTouch: true }),
    [setValue],
  );

  const updateNodeCoordinates = useCallback(
    (nodeId: string, x: number, y: number) => {
      const coordinates = { x: Math.round(x), y: Math.round(y) };
      if (nodeId === "start") {
        writeStart({ ...(start ?? {}), coordinates });
        return;
      }
      if (nodeId === "end") {
        writeEnding({ ...(ending ?? {}), coordinates });
        return;
      }
      const next = nodes.map((n) =>
        n.id === nodeId ? ({ ...n, coordinates } as FormNode) : n,
      );
      writeNodes(next);
    },
    [nodes, start, ending, writeNodes, writeStart, writeEnding],
  );

  const setNextNode = useCallback(
    (
      sourceId: string,
      sourceHandle: string | null | undefined,
      targetId: string,
    ) => {
      const target = targetId === "end" ? ENDING_TARGET : targetId;
      if (sourceId === "start") {
        writeStart({ ...(start ?? {}), next_node: target });
        return;
      }
      const idx = nodes.findIndex((n) => n.id === sourceId);
      if (idx < 0) return;
      const node = nodes[idx];
      const next = [...nodes];
      if (node.type === "ROUTER") {
        if (sourceHandle === "router-fallback") {
          next[idx] = {
            ...node,
            config: { ...node.config, fallback: target },
          };
        } else if (sourceHandle?.startsWith("router-rule-")) {
          const ruleId = sourceHandle.slice("router-rule-".length);
          const rules = (node.config?.rules ?? []) as RouterRule[];
          next[idx] = {
            ...node,
            config: {
              ...node.config,
              rules: rules.map((r) =>
                r.id === ruleId ? { ...r, next_node: target } : r,
              ),
            },
          };
        }
      } else {
        next[idx] = {
          ...node,
          config: { ...node.config, next_node: target },
        } as FormNode;
      }
      writeNodes(next);
    },
    [nodes, start, writeNodes, writeStart],
  );

  const nextSpawnPosition = useCallback(() => {
    const positions = nodes
      .map((n) => n.coordinates)
      .filter((c): c is { x: number; y: number } => !!c);
    const maxX = positions.length
      ? Math.max(...positions.map((p) => p.x))
      : 200;
    const avgY = positions.length
      ? positions.reduce((s, p) => s + p.y, 0) / positions.length
      : 200;
    return { x: maxX + 320, y: Math.round(avgY) };
  }, [nodes]);

  const addStep = useCallback(() => {
    const id = randomId("step");
    const nextButton: NextButtonComponent = {
      id: randomId("next_button"),
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: "Continue" },
    };
    const step: FormNode = {
      id,
      type: "STEP",
      coordinates: nextSpawnPosition(),
      alias: "New step",
      config: {
        components: [nextButton as FormNodeComponent],
      },
    };
    writeNodes([...nodes, step]);
    return id;
  }, [nodes, nextSpawnPosition, writeNodes]);

  const addFlow = useCallback(() => {
    const id = randomId("flow");
    const node: FormNode = {
      id,
      type: "FLOW",
      coordinates: nextSpawnPosition(),
      alias: "New flow",
      config: { flow_id: "" },
    };
    writeNodes([...nodes, node]);
    return id;
  }, [nodes, nextSpawnPosition, writeNodes]);

  const addRouter = useCallback(() => {
    const id = randomId("router");
    const ruleId = randomId("rule");
    const router: FormNode = {
      id,
      type: "ROUTER",
      coordinates: nextSpawnPosition(),
      alias: "New router",
      config: {
        rules: [
          {
            id: ruleId,
            alias: "Rule 1",
            condition: { conditions: [] },
            next_node: ENDING_TARGET,
          },
        ],
        fallback: ENDING_TARGET,
      },
    };
    writeNodes([...nodes, router]);
    return id;
  }, [nodes, nextSpawnPosition, writeNodes]);

  const removeNode = useCallback(
    (nodeId: string) => {
      if (nodeId === "start" || nodeId === "end") return;
      const next = nodes
        .filter((n) => n.id !== nodeId)
        .map((n): FormNode => {
          if (n.type === "ROUTER") {
            const rules = (n.config?.rules ?? []) as RouterRule[];
            return {
              ...n,
              config: {
                ...n.config,
                rules: rules.map((r) =>
                  r.next_node === nodeId
                    ? { ...r, next_node: ENDING_TARGET }
                    : r,
                ),
                fallback:
                  n.config?.fallback === nodeId
                    ? ENDING_TARGET
                    : n.config?.fallback,
              },
            };
          }
          if (n.type === "STEP" && n.config?.next_node === nodeId) {
            return { ...n, config: { ...n.config, next_node: undefined } };
          }
          if (n.type === "FLOW" && n.config?.next_node === nodeId) {
            return { ...n, config: { ...n.config, next_node: undefined } };
          }
          return n;
        });
      if (start?.next_node === nodeId) {
        writeStart({ ...start, next_node: undefined });
      }
      writeNodes(next);
    },
    [nodes, start, writeNodes, writeStart],
  );

  return {
    updateNodeCoordinates,
    setNextNode,
    addStep,
    addFlow,
    addRouter,
    removeNode,
  };
}
