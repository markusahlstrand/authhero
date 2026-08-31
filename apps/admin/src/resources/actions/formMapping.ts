/**
 * Mapping between the stored action record and the edit form's values.
 *
 * The API models the trigger an action runs on as a `supported_triggers`
 * array, while the form edits a single `trigger_id`. These two functions are
 * the only place that conversion happens, in both directions, so an existing
 * action loads with its trigger selected instead of an empty one.
 */

export type ActionSecret = { name: string; value?: string };
export type ActionTrigger = { id?: string; version?: string };

export type ActionRecord = {
  id?: string | number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  deployed_at?: string;
  supported_triggers?: ActionTrigger[];
  secrets?: ActionSecret[];
  trigger_id?: string;
} & Record<string, unknown>;

/** The Auth0-facing trigger ids an action can be bound to. */
export const ACTION_TRIGGER_IDS = [
  "post-login",
  "credentials-exchange",
  "pre-user-registration",
  "post-user-registration",
] as const;

export const ACTION_TRIGGER_CHOICES = ACTION_TRIGGER_IDS.map((id) => ({
  id,
  name: id,
}));

/**
 * Record → form values. Derives `trigger_id` from the stored
 * `supported_triggers` and replaces every secret value with `sentinel`, so the
 * form never holds a real secret and unchanged secrets stay recognisable.
 */
export function toActionFormValues(
  data: ActionRecord,
  sentinel: string,
): ActionRecord {
  return {
    ...data,
    trigger_id: data.trigger_id ?? data.supported_triggers?.[0]?.id,
    secrets: data.secrets?.map((s) => ({ name: s.name, value: sentinel })),
  };
}

/**
 * Form values → update payload. Writes the selected `trigger_id` back as
 * `supported_triggers`, keeps secrets the user did not touch valueless (the
 * adapter merges those by name), and drops the server-owned fields.
 */
export function fromActionFormValues(
  data: ActionRecord,
  sentinel: string,
): Record<string, unknown> {
  const {
    id: _id,
    tenant_id: _tenant_id,
    created_at: _created_at,
    updated_at: _updated_at,
    status: _status,
    deployed_at: _deployed_at,
    trigger_id,
    ...rest
  } = data;

  const cleanedSecrets = (rest.secrets ?? [])
    .filter((s): s is ActionSecret => !!s?.name)
    .map((s) =>
      s.value === sentinel
        ? { name: s.name }
        : { name: s.name, value: s.value },
    );

  const existingTriggers = rest.supported_triggers;
  // Reuse the stored entry when the trigger is unchanged so its `version`
  // survives the round-trip.
  const supported_triggers = trigger_id
    ? existingTriggers?.[0]?.id === trigger_id
      ? existingTriggers
      : [{ id: trigger_id }]
    : existingTriggers;

  return {
    ...rest,
    ...(supported_triggers ? { supported_triggers } : {}),
    secrets: cleanedSecrets,
  };
}
