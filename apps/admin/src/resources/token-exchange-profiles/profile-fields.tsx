import { useMemo } from "react";
import {
  required,
  useCreatePath,
  useGetList,
  useGetOne,
  useInput,
  useRecordContext,
} from "ra-core";
import { useWatch } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  BooleanInput,
  NumberInput,
  RadioButtonGroupInput,
  SelectInput,
  TextArrayInput,
  TextInput,
} from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_MAX_LIFETIME_SECONDS,
  TOKEN_EXCHANGE_ALGORITHMS,
  validateJwksJson,
  validateSubjectTokenType,
  type ProfileFormValues,
} from "./formMapping";

export const CUSTOM_TOKEN_EXCHANGE_TRIGGER = "custom-token-exchange";

const MODE_CHOICES = [
  { id: "jwt", name: "Verify JWT (no code)" },
  { id: "action", name: "Action" },
];

const KEYS_SOURCE_CHOICES = [
  { id: "jwks_uri", name: "JWKS URL" },
  { id: "jwks", name: "Paste JWKS" },
];

const USER_MAPPING_CHOICES = [
  { id: "connection", name: "Users from a connection" },
  { id: "user_id", name: "Token sub is an existing user id" },
];

const httpsUrl = (value: unknown) =>
  typeof value === "string" && value && !/^https:\/\/\S+$/i.test(value)
    ? "Must be an https:// URL"
    : undefined;

const lifetimeRange = (value: unknown) =>
  typeof value === "number" && (value < 1 || value > 3600)
    ? "Must be between 1 and 3600"
    : undefined;

type ActionRecord = {
  id: string;
  name?: string;
  supported_triggers?: Array<{ id?: string }>;
};

type ConnectionRecord = { id: string; name?: string; strategy?: string };

function AlgorithmsInput() {
  const { field } = useInput({ source: "jwt_verification.algorithms" });
  const selected: string[] = Array.isArray(field.value) ? field.value : [];

  const toggle = (alg: string, checked: boolean) => {
    field.onChange(
      checked ? [...selected, alg] : selected.filter((a) => a !== alg),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Algorithms</Label>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TOKEN_EXCHANGE_ALGORITHMS.map((alg) => {
          const id = `algorithm-${alg}`;
          return (
            <label
              key={alg}
              htmlFor={id}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={id}
                checked={selected.includes(alg)}
                onCheckedChange={(v) => toggle(alg, v === true)}
              />
              {alg}
            </label>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        Leave all unchecked to accept any of them. Symmetric algorithms and
        &quot;none&quot; are never accepted.
      </p>
    </div>
  );
}

function ConnectionSelect() {
  const { data, isPending } = useGetList<ConnectionRecord>("connections", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "name", order: "ASC" },
  });
  const choices = useMemo(
    () =>
      (data ?? [])
        .filter((c) => c.name)
        .map((c) => ({
          id: c.name ?? "",
          name: c.strategy ? `${c.name} (${c.strategy})` : (c.name ?? ""),
        })),
    [data],
  );

  return (
    <SelectInput
      source="jwt_verification.user_mapping.connection"
      label="Connection"
      choices={choices}
      isPending={isPending}
      translateChoice={false}
      validate={required()}
      helperText="The token's sub becomes the user's id in this connection: the user_id is <strategy>|<sub>."
    />
  );
}

function UserMappingFields() {
  const mappingType = useWatch({
    name: "jwt_verification.user_mapping.type",
  }) as string | undefined;

  return (
    <>
      <RadioButtonGroupInput
        source="jwt_verification.user_mapping.type"
        label="User mapping"
        choices={USER_MAPPING_CHOICES}
        defaultValue="connection"
      />
      {mappingType === "user_id" ? (
        <p className="text-sm text-muted-foreground">
          The token&apos;s sub must be the user_id of an existing user. No users
          are created.
        </p>
      ) : (
        <>
          <ConnectionSelect />
          <BooleanInput
            source="jwt_verification.user_mapping.create_if_not_exists"
            label="Create user if not exists"
            defaultValue={true}
            helperText="When off, a sub with no matching user is rejected."
          />
          <BooleanInput
            source="jwt_verification.user_mapping.trust_email_verified"
            label="Trust email_verified claim"
            defaultValue={false}
            helperText="Copy the token's email_verified onto new users. Leave off unless the issuer verifies emails — a verified email can link the user to an existing account with the same address."
          />
        </>
      )}
    </>
  );
}

function JwtVerificationFields() {
  const keysSource = useWatch({ name: "keys_source" }) as string | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>JWT verification</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TextInput
          source="jwt_verification.issuer"
          label="Issuer"
          validate={required()}
          helperText="Must match the token's iss claim exactly."
        />
        <RadioButtonGroupInput
          source="keys_source"
          label="Signing keys"
          choices={KEYS_SOURCE_CHOICES}
          defaultValue="jwks_uri"
        />
        {keysSource === "jwks" ? (
          <TextInput
            source="jwks_json"
            label="JWKS"
            multiline
            validate={[required(), validateJwksJson]}
            helperText='The public keys as a JWKS document: { "keys": [ … ] }'
          />
        ) : (
          <TextInput
            source="jwt_verification.jwks_uri"
            label="JWKS URL"
            validate={[required(), httpsUrl]}
            helperText="e.g. https://api.example.com/.well-known/jwks.json"
          />
        )}
        <TextArrayInput
          source="jwt_verification.audience"
          label="Audience"
          helperText="Accepted aud values. Defaults to this tenant's issuer and token endpoint."
        />
        <AlgorithmsInput />
        <NumberInput
          source="jwt_verification.max_lifetime_seconds"
          label="Max lifetime (seconds)"
          defaultValue={DEFAULT_MAX_LIFETIME_SECONDS}
          min={1}
          max={3600}
          validate={lifetimeRange}
          helperText="Tokens valid for longer than this (exp - iat) are rejected. 1–3600."
        />
        <BooleanInput
          source="jwt_verification.require_jti"
          label="Require jti"
          defaultValue={true}
          helperText="Require a jti claim and accept each value only once."
        />
        <UserMappingFields />
      </CardContent>
    </Card>
  );
}

function ActionCreateHint() {
  const createPath = useCreatePath();
  const source = encodeURIComponent(
    JSON.stringify({ trigger_id: CUSTOM_TOKEN_EXCHANGE_TRIGGER }),
  );
  return (
    <p className="text-sm text-muted-foreground">
      Only actions on the {CUSTOM_TOKEN_EXCHANGE_TRIGGER} trigger are listed.{" "}
      <Link
        to={`${createPath({ resource: "actions", type: "create" })}?source=${source}`}
        className="text-primary underline"
      >
        Create one
      </Link>{" "}
      with that trigger: it exports onExecuteCustomTokenExchange, verifies
      event.transaction.subject_token and calls
      api.authentication.setUserByConnection or setUserById.
    </p>
  );
}

function ActionSelect() {
  const { data, isPending } = useGetList<ActionRecord>("actions", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "name", order: "ASC" },
  });
  const choices = useMemo(
    () =>
      (data ?? [])
        .filter((a) =>
          (a.supported_triggers ?? []).some(
            (t) => t?.id === CUSTOM_TOKEN_EXCHANGE_TRIGGER,
          ),
        )
        .map((a) => ({ id: a.id, name: a.name || a.id })),
    [data],
  );

  return (
    <>
      <SelectInput
        source="action_id"
        label="Action"
        choices={choices}
        isPending={isPending}
        translateChoice={false}
        validate={required()}
        helperText="Cannot be changed after the profile is created."
      />
      <ActionCreateHint />
    </>
  );
}

function ActionReadOnly({ actionId }: { actionId: string }) {
  const createPath = useCreatePath();
  const { data } = useGetOne<ActionRecord>("actions", { id: actionId });
  return (
    <div className="flex flex-col gap-1">
      <Label>Action</Label>
      <Link
        to={createPath({ resource: "actions", type: "edit", id: actionId })}
        className="text-sm text-primary underline"
      >
        {data?.name ?? actionId}
      </Link>
      <p className="text-sm text-muted-foreground">
        The action cannot be changed after the profile is created. Create a new
        profile to use a different one.
      </p>
    </div>
  );
}

export function ProfileFields({ isEdit = false }: { isEdit?: boolean }) {
  const record = useRecordContext<ProfileFormValues>();
  const watchedMode = useWatch({ name: "mode" }) as string | undefined;
  // The mode is fixed once the profile exists: it follows `action_id`.
  const mode = isEdit ? (record?.action_id ? "action" : "jwt") : watchedMode;

  return (
    <div className="flex flex-col gap-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextInput source="name" validate={required()} />
          <TextInput
            source="subject_token_type"
            label="Subject token type"
            validate={[required(), validateSubjectTokenType]}
            helperText="A URI starting with https:// or urn:, e.g. urn:acme:session-token. urn:ietf:params:oauth:, urn:auth0 and urn:okta are reserved."
          />
          {isEdit ? (
            <div className="flex flex-col gap-1">
              <Label>Mode</Label>
              <p className="text-sm">
                {mode === "action" ? "Action" : "Verify JWT (no code)"}
              </p>
            </div>
          ) : (
            <RadioButtonGroupInput
              source="mode"
              label="Mode"
              choices={MODE_CHOICES}
              defaultValue="jwt"
              helperText="How the subject token is validated and mapped to a user. Cannot be changed after creation."
            />
          )}
          {mode === "action" &&
            (isEdit && record?.action_id ? (
              <ActionReadOnly actionId={record.action_id} />
            ) : (
              <ActionSelect />
            ))}
        </CardContent>
      </Card>

      {mode !== "action" && <JwtVerificationFields />}
    </div>
  );
}
