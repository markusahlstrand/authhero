import { useMemo, useState } from "react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, Link2Off, Plus } from "lucide-react";
import { codeHookTriggerChoices } from "../hooks/hookConstants";

const ACTION_TO_HOOK_TRIGGER: Record<string, string> = {
  "post-login": "post-user-login",
};

function actionSupportsTrigger(
  action: ActionRecord,
  hookTriggerId: string,
): boolean {
  return (action.supported_triggers ?? []).some((t) => {
    if (!t?.id) return false;
    const mapped = ACTION_TO_HOOK_TRIGGER[t.id] || t.id;
    return mapped === hookTriggerId;
  });
}

interface CodeHook {
  hook_id: string;
  id?: string;
  trigger_id: string;
  code_id: string;
  enabled: boolean;
  priority?: number;
}

interface ActionRecord {
  id: string;
  name: string;
  supported_triggers?: Array<{ id?: string }>;
}

interface TriggerSectionProps {
  triggerId: string;
  triggerName: string;
  hooks: CodeHook[];
  actions: ActionRecord[];
}

function TriggerSection({
  triggerId,
  triggerName,
  hooks,
  actions,
}: TriggerSectionProps) {
  const refresh = useRefresh();
  const notify = useNotify();
  const [update] = useUpdate();
  const [remove] = useDelete();
  const [create] = useCreate();
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachActionId, setAttachActionId] = useState<string>("");

  const sortedHooks = useMemo(
    () => [...hooks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
    [hooks],
  );

  const actionsById = useMemo(() => {
    const map: Record<string, ActionRecord> = {};
    for (const a of actions) map[a.id] = a;
    return map;
  }, [actions]);

  const availableActions = useMemo(
    () =>
      actions.filter(
        (a) =>
          actionSupportsTrigger(a, triggerId) &&
          !hooks.some((h) => h.code_id === a.id),
      ),
    [actions, hooks, triggerId],
  );

  const hookId = (h: CodeHook) => h.hook_id || h.id || "";

  const swapPriority = async (i: number, j: number) => {
    const a = sortedHooks[i];
    const b = sortedHooks[j];
    if (!a || !b) return;
    const aPrio = a.priority ?? 0;
    const bPrio = b.priority ?? 0;
    const newAPrio = bPrio === aPrio ? aPrio + 1 : bPrio;
    const newBPrio = aPrio === bPrio ? aPrio - 1 : aPrio;
    try {
      await Promise.all([
        update("hooks", { id: hookId(a), data: { priority: newAPrio }, previousData: a }),
        update("hooks", { id: hookId(b), data: { priority: newBPrio }, previousData: b }),
      ]);
      refresh();
    } catch (err) {
      notify(`Reorder failed: ${(err as Error).message}`, { type: "error" });
    }
  };

  const toggleEnabled = async (h: CodeHook) => {
    try {
      await update("hooks", {
        id: hookId(h),
        data: { enabled: !h.enabled },
        previousData: h,
      });
      refresh();
    } catch (err) {
      notify(`Update failed: ${(err as Error).message}`, { type: "error" });
    }
  };

  const unbind = async (h: CodeHook) => {
    try {
      await remove("hooks", { id: hookId(h), previousData: h });
      refresh();
    } catch (err) {
      notify(`Unbind failed: ${(err as Error).message}`, { type: "error" });
    }
  };

  const attach = async () => {
    if (!attachActionId) return;
    const maxPriority = sortedHooks.reduce(
      (max, h) => Math.max(max, h.priority ?? 0),
      0,
    );
    try {
      await create("hooks", {
        data: {
          trigger_id: triggerId,
          code_id: attachActionId,
          enabled: true,
          priority: maxPriority + 1,
        },
      });
      setAttachOpen(false);
      setAttachActionId("");
      refresh();
    } catch (err) {
      notify(`Attach failed: ${(err as Error).message}`, { type: "error" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{triggerName}</CardTitle>
          <p className="text-sm text-muted-foreground">{triggerId}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttachOpen(true)}
          disabled={availableActions.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" /> Attach action
        </Button>
      </CardHeader>
      <CardContent>
        {sortedHooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No actions attached. Higher-priority actions run first.
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {sortedHooks.map((h, idx) => {
              const action = actionsById[h.code_id];
              return (
                <div
                  key={hookId(h)}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex flex-col">
                    {action ? (
                      <Link
                        to={`../actions/${action.id}`}
                        className="text-primary underline"
                      >
                        {action.name}
                      </Link>
                    ) : (
                      <em className="text-muted-foreground">
                        Missing action {h.code_id}
                      </em>
                    )}
                    <span className="text-xs text-muted-foreground">
                      priority {h.priority ?? 0} · {h.code_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={h.enabled}
                      onCheckedChange={() => toggleEnabled(h)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => swapPriority(idx, idx - 1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === sortedHooks.length - 1}
                      onClick={() => swapPriority(idx, idx + 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => unbind(h)}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach action to {triggerName}</DialogTitle>
          </DialogHeader>
          <Select value={attachActionId} onValueChange={setAttachActionId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an action" />
            </SelectTrigger>
            <SelectContent>
              {availableActions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>
              Cancel
            </Button>
            <Button onClick={attach} disabled={!attachActionId}>
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ActionTriggersList() {
  const { data: hookData, isLoading: hooksLoading } = useGetList("hooks", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "priority", order: "DESC" },
  });
  const { data: actionData, isLoading: actionsLoading } = useGetList(
    "actions",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "name", order: "ASC" },
    },
  );

  const codeHooks: CodeHook[] = useMemo(
    () =>
      (hookData ?? []).filter(
        (h): h is CodeHook =>
          typeof (h as CodeHook)?.code_id === "string" &&
          (h as CodeHook).code_id.length > 0,
      ) as CodeHook[],
    [hookData],
  );
  const actions: ActionRecord[] = useMemo(
    () => ((actionData ?? []) as ActionRecord[]),
    [actionData],
  );

  if (hooksLoading || actionsLoading) {
    return <div className="p-4">Loading…</div>;
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">Triggers</h2>
        <p className="text-sm text-muted-foreground">
          Attach deployed actions to triggers. Higher-priority actions run first.
        </p>
      </div>
      {codeHookTriggerChoices.map((t) => (
        <TriggerSection
          key={t.id}
          triggerId={t.id}
          triggerName={t.name}
          hooks={codeHooks.filter((h) => h.trigger_id === t.id)}
          actions={actions}
        />
      ))}
    </div>
  );
}
