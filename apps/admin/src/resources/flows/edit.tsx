import { useEffect, useMemo, useRef, useState } from "react";
import {
  useController,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import {
  ArrowDown,
  ArrowUp,
  Info,
  Plus,
  Trash2,
} from "lucide-react";

import {
  BooleanInput,
  Edit,
  SelectInput,
  SimpleForm,
  TextInput,
} from "@/components/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  Auth0UpdateUserAction,
  EmailVerifyAction,
  FlowActionStep,
  RedirectAction,
} from "@authhero/adapter-interfaces";

const ACTION_TYPE_CHOICES = [
  { id: "REDIRECT", name: "Redirect" },
  { id: "AUTH0", name: "Auth0" },
  { id: "EMAIL", name: "Email" },
];

const AUTH0_ACTION_CHOICES = [
  { id: "UPDATE_USER", name: "Update user" },
];

const EMAIL_ACTION_CHOICES = [
  { id: "VERIFY_EMAIL", name: "Verify email" },
];

const REDIRECT_TARGET_CHOICES = [
  { id: "change-email", name: "Change email" },
  { id: "account", name: "Account settings" },
  { id: "custom", name: "Custom URL" },
];

function randomSuffix() {
  return Math.random().toString(36).substring(2, 6);
}

function generateActionId(type: string, action?: string) {
  const suffix = randomSuffix();
  if (type === "REDIRECT") return `redirect_user_${suffix}`;
  if (type === "EMAIL" && action === "VERIFY_EMAIL") {
    return `verify_email_address_${suffix}`;
  }
  if (type === "AUTH0") {
    return `${(action ?? "action").toLowerCase()}_${suffix}`;
  }
  return `action_${suffix}`;
}

function newRedirect(): RedirectAction {
  return {
    id: generateActionId("REDIRECT"),
    type: "REDIRECT",
    action: "REDIRECT_USER",
    params: { target: "change-email" },
  };
}

function newAuth0UpdateUser(): Auth0UpdateUserAction {
  return {
    id: generateActionId("AUTH0", "UPDATE_USER"),
    type: "AUTH0",
    action: "UPDATE_USER",
    params: { user_id: "{{user.id}}", changes: {} },
  };
}

function newEmailVerify(): EmailVerifyAction {
  return {
    id: generateActionId("EMAIL", "VERIFY_EMAIL"),
    type: "EMAIL",
    action: "VERIFY_EMAIL",
    params: { email: "{{$form.email}}" },
  };
}

function actionLabel(type: unknown, action: unknown): string {
  if (type === "REDIRECT") return "Redirect";
  if (type === "EMAIL" && action === "VERIFY_EMAIL") return "Email · Verify email";
  if (type === "EMAIL") return "Email";
  if (type === "AUTH0" && typeof action === "string") return `Auth0 · ${action}`;
  if (type === "AUTH0") return "Auth0";
  return typeof type === "string" ? type : "Unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureActionShape(action: unknown): FlowActionStep | unknown {
  if (!isRecord(action)) return action;
  const next: Record<string, unknown> = { ...action };

  if (!next.id || typeof next.id !== "string") {
    const type = typeof next.type === "string" ? next.type : "action";
    const op = typeof next.action === "string" ? next.action : undefined;
    next.id = generateActionId(type, op);
  }

  // If the user typed invalid JSON in the changes field, it may have been
  // left as a string. Try one last parse; fall back to {} to keep the API happy.
  if (
    next.type === "AUTH0" &&
    next.action === "UPDATE_USER" &&
    isRecord(next.params)
  ) {
    const params = { ...next.params };
    if (typeof params.changes === "string") {
      try {
        params.changes = JSON.parse(params.changes);
      } catch {
        params.changes = {};
      }
    }
    next.params = params;
  }

  return next;
}

function transformFlow(data: Record<string, unknown>): Record<string, unknown> {
  const actions = Array.isArray(data.actions)
    ? data.actions.map(ensureActionShape)
    : data.actions;
  return { ...data, actions };
}

interface JsonInputProps {
  source: string;
  label: string;
  helperText?: string;
  rows?: number;
}

function JsonInput({ source, label, helperText, rows = 6 }: JsonInputProps) {
  const { field } = useController({ name: source });

  const initial = useMemo(() => {
    if (field.value === undefined || field.value === null) return "{}";
    if (typeof field.value === "string") return field.value;
    try {
      return JSON.stringify(field.value, null, 2);
    } catch {
      return "{}";
    }
  }, []); // snapshot on mount; avoids fighting user input on re-renders

  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const lastSerializedRef = useRef(initial);

  // If the form is reset externally (e.g. record reload), resync the textarea.
  useEffect(() => {
    const serialized =
      field.value === undefined || field.value === null
        ? "{}"
        : typeof field.value === "string"
          ? field.value
          : JSON.stringify(field.value, null, 2);
    if (serialized !== lastSerializedRef.current) {
      lastSerializedRef.current = serialized;
      setText(serialized);
      setError(null);
    }
  }, [field.value]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${source}-json`}>{label}</Label>
      <Textarea
        id={`${source}-json`}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (!next.trim()) {
            lastSerializedRef.current = "{}";
            field.onChange({});
            setError(null);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(next);
            lastSerializedRef.current = next;
            field.onChange(parsed);
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON");
          }
        }}
        className="font-mono text-sm min-h-[140px]"
        rows={rows}
      />
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : helperText ? (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}

interface ActionFieldProps {
  base: string;
}

function RedirectFields({ base }: ActionFieldProps) {
  const target = useWatch({ name: `${base}.params.target` });
  return (
    <>
      <SelectInput
        source={`${base}.params.target`}
        label="Redirect to"
        choices={REDIRECT_TARGET_CHOICES}
        defaultValue="change-email"
        helperText="Where to send the user"
      />
      {target === "custom" && (
        <TextInput
          source={`${base}.params.custom_url`}
          label="Custom URL"
          helperText="Full URL to redirect the user to"
        />
      )}
    </>
  );
}

function Auth0Fields({ base, action }: ActionFieldProps & { action: unknown }) {
  return (
    <>
      <SelectInput
        source={`${base}.action`}
        label="Operation"
        choices={AUTH0_ACTION_CHOICES}
        defaultValue="UPDATE_USER"
      />
      {action === "UPDATE_USER" && (
        <>
          <TextInput
            source={`${base}.params.user_id`}
            label="User ID"
            defaultValue="{{user.id}}"
            helperText="Template variable for the user ID, e.g. {{user.id}}"
          />
          <TextInput
            source={`${base}.params.connection_id`}
            label="Connection ID (optional)"
            helperText="Optional connection ID to scope the update"
          />
          <JsonInput
            source={`${base}.params.changes`}
            label="Changes"
            helperText='User properties to update, e.g. {"email_verified": true}'
          />
        </>
      )}
    </>
  );
}

function EmailFields({ base, action }: ActionFieldProps & { action: unknown }) {
  return (
    <>
      <SelectInput
        source={`${base}.action`}
        label="Operation"
        choices={EMAIL_ACTION_CHOICES}
        defaultValue="VERIFY_EMAIL"
      />
      {action === "VERIFY_EMAIL" && (
        <TextInput
          source={`${base}.params.email`}
          label="Email"
          defaultValue="{{$form.email}}"
          helperText="Template variable for the email, e.g. {{$form.email}}"
        />
      )}
    </>
  );
}

interface ActionCardProps {
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ActionCard({
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ActionCardProps) {
  const base = `actions.${index}`;
  const type = useWatch({ name: `${base}.type` });
  const action = useWatch({ name: `${base}.action` });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            #{index + 1}
          </span>
          <Badge variant="secondary">{actionLabel(type, action)}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index >= total - 1}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TextInput
          source={`${base}.alias`}
          label="Alias (optional)"
          helperText="A friendly name for this step"
        />
        <SelectInput
          source={`${base}.type`}
          label="Type"
          choices={ACTION_TYPE_CHOICES}
        />
        {type === "REDIRECT" && <RedirectFields base={base} />}
        {type === "AUTH0" && <Auth0Fields base={base} action={action} />}
        {type === "EMAIL" && <EmailFields base={base} action={action} />}
        <BooleanInput
          source={`${base}.allow_failure`}
          label="Allow failure"
          helperText="Continue the flow even if this action fails"
        />
      </CardContent>
    </Card>
  );
}

function ActionsField() {
  const { fields, append, remove, move } = useFieldArray({ name: "actions" });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Actions</h3>
        <p className="text-sm text-muted-foreground">
          Steps to execute in sequence when this flow runs.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Tip</AlertTitle>
        <AlertDescription>
          To redirect users to the change-email page, add a Redirect action with
          target &quot;Change email&quot;.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <ActionCard
            key={field.id}
            index={index}
            total={fields.length}
            onRemove={() => remove(index)}
            onMoveUp={() => move(index, index - 1)}
            onMoveDown={() => move(index, index + 1)}
          />
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-fit">
            <Plus className="mr-2 h-4 w-4" /> Add action
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => append(newRedirect())}>
            Redirect
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => append(newAuth0UpdateUser())}>
            Auth0 — Update user
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => append(newEmailVerify())}>
            Email — Verify email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FlowEdit() {
  return (
    <Edit mutationMode="pessimistic" transform={transformFlow}>
      <SimpleForm>
        <TextInput source="name" required />
        <ActionsField />
      </SimpleForm>
    </Edit>
  );
}
