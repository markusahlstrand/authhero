import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  ArrayInput,
  CodeInput,
  Create,
  SelectInput,
  SimpleForm,
  SimpleFormIterator,
  TextInput,
} from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDefaultCodeTemplate } from "../hooks/hookConstants";
import { ACTION_TRIGGER_CHOICES } from "./formMapping";

interface ActionPayload {
  trigger_id?: string;
  supported_triggers?: Array<{ id: string }>;
  secrets?: Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
}

/**
 * Swaps in the selected trigger's starter code, but only while the editor
 * still holds the previous starter (or nothing), so typed code is never lost.
 * The trigger can be preset with `?source={"trigger_id":"…"}`.
 */
function StarterCodeSync() {
  const triggerId = useWatch({ name: "trigger_id" }) as string | undefined;
  const { getValues, setValue } = useFormContext();
  const previousTrigger = useRef<string | undefined>(undefined);

  useEffect(() => {
    const code: unknown = getValues("code");
    const previousStarter =
      previousTrigger.current === undefined
        ? undefined
        : getDefaultCodeTemplate(previousTrigger.current);
    if (!code || code === previousStarter) {
      setValue("code", getDefaultCodeTemplate(triggerId));
    }
    previousTrigger.current = triggerId;
  }, [triggerId, getValues, setValue]);

  return null;
}

export function ActionCreate() {
  return (
    <Create
      transform={({ trigger_id, ...data }: ActionPayload) => ({
        ...data,
        supported_triggers: data.supported_triggers ?? [
          { id: trigger_id || "post-login" },
        ],
        secrets: data.secrets?.filter((s) => s?.name),
      })}
    >
      <SimpleForm className="max-w-none">
        <div className="flex flex-col gap-6 w-full">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TextInput source="name" required />
              <SelectInput
                source="trigger_id"
                label="Trigger"
                choices={ACTION_TRIGGER_CHOICES}
                defaultValue="post-login"
                helperText="The event this action runs on. custom-token-exchange actions are used by a Custom Token Exchange profile instead of a trigger binding."
              />
              <TextInput source="runtime" defaultValue="webworker" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Code</CardTitle>
            </CardHeader>
            <CardContent>
              <StarterCodeSync />
              <CodeInput source="code" language="javascript" height={420} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secrets</CardTitle>
            </CardHeader>
            <CardContent>
              <ArrayInput source="secrets" label={false}>
                <SimpleFormIterator inline>
                  <TextInput source="name" label="Name" />
                  <TextInput source="value" label="Value" type="password" />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <ArrayInput source="dependencies" label={false}>
                <SimpleFormIterator inline>
                  <TextInput source="name" label="Package" />
                  <TextInput source="version" label="Version" />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </div>
      </SimpleForm>
    </Create>
  );
}
