import { useController, useWatch } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

import { NodeTargetSelect } from "./NodeTargetSelect";
import { RouterConditionBuilder } from "./RouterConditionBuilder";
import { ENDING_TARGET, randomId } from "../constants";
import { isRouterConditionGroup, type RouterRule } from "../types";

interface RouterEditorProps {
  index: number;
}

export function RouterEditor({ index }: RouterEditorProps) {
  const base = `nodes.${index}` as const;
  const { field: alias } = useController({ name: `${base}.alias` });
  const { field: rulesField } = useController({ name: `${base}.config.rules` });

  const rules = (useWatch({ name: `${base}.config.rules` }) as
    | RouterRule[]
    | undefined) ?? [];

  const updateRules = (next: RouterRule[]) => rulesField.onChange(next);

  const addRule = () => {
    const newRule: RouterRule = {
      id: randomId("rule"),
      alias: `Rule ${rules.length + 1}`,
      condition: { conditions: [] },
      next_node: ENDING_TARGET,
    };
    updateRules([...rules, newRule]);
  };

  const removeRule = (ruleId: string) =>
    updateRules(rules.filter((r) => r.id !== ruleId));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Router</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Alias</Label>
            <Input
              value={(alias.value as string | undefined) ?? ""}
              onChange={(e) => alias.onChange(e.target.value || undefined)}
              placeholder="Friendly name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rules</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rules.map((rule, ruleIdx) => (
            <RuleRow
              key={rule.id}
              ruleIndex={ruleIdx}
              baseName={`${base}.config.rules.${ruleIdx}`}
              onRemove={() => removeRule(rule.id)}
              canRemove={rules.length > 1}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addRule}
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fallback</CardTitle>
        </CardHeader>
        <CardContent>
          <NodeTargetSelect
            name={`${base}.config.fallback`}
            label="Default route"
            placeholder="Select fallback node"
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface RuleRowProps {
  baseName: string;
  ruleIndex: number;
  onRemove: () => void;
  canRemove: boolean;
}

function RuleRow({ baseName, ruleIndex, onRemove, canRemove }: RuleRowProps) {
  const { field: alias } = useController({ name: `${baseName}.alias` });
  const conditionValue = useWatch({ name: `${baseName}.condition` });
  const unknownShape =
    conditionValue !== undefined &&
    conditionValue !== null &&
    !isRouterConditionGroup(conditionValue);

  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Input
          value={(alias.value as string | undefined) ?? ""}
          onChange={(e) => alias.onChange(e.target.value || undefined)}
          placeholder={`Rule ${ruleIndex + 1}`}
          className="h-8"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove rule"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {unknownShape ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unknown condition shape</AlertTitle>
          <AlertDescription>
            This rule was authored outside the designer. Edit it from the Raw
            JSON tab to avoid data loss.
          </AlertDescription>
        </Alert>
      ) : (
        <RouterConditionBuilder name={`${baseName}.condition`} />
      )}

      <div className="mt-3">
        <NodeTargetSelect name={`${baseName}.next_node`} label="Next node" />
      </div>
    </div>
  );
}
