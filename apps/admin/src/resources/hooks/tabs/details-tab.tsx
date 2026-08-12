import {
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTemplateChoicesForTrigger,
  getTriggerChoicesForType,
  pageChoices,
} from "../hookConstants";
import { TryHookButton } from "../try-hook-button";

interface HookRecord {
  url?: string;
  form_id?: string;
  template_id?: string;
  code_id?: string;
  page_id?: string;
  trigger_id?: string;
}

type HookVariant = "url" | "form" | "template" | "code" | "page";

const HOOK_VARIANT_FIELDS: ReadonlyArray<[keyof HookRecord, HookVariant]> = [
  ["url", "url"],
  ["form_id", "form"],
  ["template_id", "template"],
  ["code_id", "code"],
  ["page_id", "page"],
];

/**
 * The hook variant, from whichever type-specific field the row carries.
 *
 * Keyed on the field being *present* rather than truthy, matching
 * `allowedTriggersForHook` on the server (`typeof … === "string"`). A row
 * whose discriminator is an empty string is still that variant to the API, so
 * classifying it as unknown here would offer the full trigger list and let the
 * edit submit a trigger the API then rejects.
 */
function hookTypeOf(record?: HookRecord): HookVariant | undefined {
  if (!record) return undefined;
  for (const [field, variant] of HOOK_VARIANT_FIELDS) {
    if (typeof record[field] === "string") return variant;
  }
  return undefined;
}

/**
 * Trigger list narrowed to what this hook's type can actually run on. A row
 * stored before those lists were enforced keeps its own trigger as a flagged
 * choice — dropping it would submit an empty trigger and 400 the whole edit,
 * leaving a dead hook that can't even be disabled.
 */
function TriggerField() {
  const record = useRecordContext<HookRecord>();
  const choices = getTriggerChoicesForType(hookTypeOf(record));
  const current = record?.trigger_id;
  const choicesWithCurrent =
    current && !choices.some((c) => c.id === current)
      ? [
          ...choices,
          { id: current, name: `${current} — never runs for this hook type` },
        ]
      : choices;

  return (
    <SelectInput
      source="trigger_id"
      label="Trigger"
      choices={choicesWithCurrent}
    />
  );
}

function TypeSpecificFields() {
  const record = useRecordContext<HookRecord>();
  // Same variant resolution as the trigger list, so the two can never disagree
  // about what kind of hook is being edited.
  switch (hookTypeOf(record)) {
    case "url":
      return <TextInput source="url" label="Webhook URL" />;
    case "form":
      return <TextInput source="form_id" label="Form ID" />;
    case "template":
      return (
        <SelectInput
          source="template_id"
          label="Template"
          choices={getTemplateChoicesForTrigger(record?.trigger_id)}
        />
      );
    case "code":
      return <TextInput source="code_id" label="Code ID" />;
    case "page":
      return (
        <>
          <SelectInput source="page_id" label="Page" choices={pageChoices} />
          <TextInput
            source="permission_required"
            label="Permission required"
            helperText="Only interrupt the login for users holding this permission (e.g. users:impersonate). Leave empty to show the page on every login."
          />
        </>
      );
    default:
      return null;
  }
}

export function DetailsTab() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Basic information</CardTitle>
        <TryHookButton />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TypeSpecificFields />
        <TriggerField />
        <BooleanInput source="enabled" />
        <BooleanInput source="synchronous" />
        <NumberInput source="priority" />
        <BooleanInput source="metadata.inheritable" label="Inheritable" />
        <BooleanInput
          source="metadata.copy_user_metadata"
          label="Copy user metadata"
        />
      </CardContent>
    </Card>
  );
}
