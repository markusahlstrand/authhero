import { useController } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function EndEditor() {
  const { field: resumeField } = useController({ name: "ending.resume_flow" });
  const { field: redirectTarget } = useController({
    name: "ending.redirection.target",
  });
  const { field: redirectDelay } = useController({
    name: "ending.redirection.delay",
  });
  const { field: afterSubmitFlowId } = useController({
    name: "ending.after_submit.flow_id",
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Behaviour</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label className="text-sm">Resume authentication flow</Label>
              <span className="text-xs text-muted-foreground">
                Return the user to the auth flow that triggered this form.
              </span>
            </div>
            <Switch
              checked={!!resumeField.value}
              onCheckedChange={(v) => resumeField.onChange(v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Redirection</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Target URL</Label>
            <Input
              placeholder="https://example.com/done"
              value={(redirectTarget.value as string | undefined) ?? ""}
              onChange={(e) =>
                redirectTarget.onChange(e.target.value || undefined)
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Delay (seconds)</Label>
            <Input
              type="number"
              min={0}
              value={
                redirectDelay.value === undefined ||
                redirectDelay.value === null
                  ? ""
                  : (redirectDelay.value as number)
              }
              onChange={(e) =>
                redirectDelay.onChange(
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">After submit</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label className="text-xs">Continue flow</Label>
          <Input
            placeholder="flow_..."
            value={(afterSubmitFlowId.value as string | undefined) ?? ""}
            onChange={(e) =>
              afterSubmitFlowId.onChange(e.target.value || undefined)
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
