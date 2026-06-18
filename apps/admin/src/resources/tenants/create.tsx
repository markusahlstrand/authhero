import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  Create,
  RadioButtonGroupInput,
  SimpleForm,
  TextInput,
} from "@/components/admin";

const deploymentTypeChoices = [
  { id: "shared", name: "Shared (default)" },
  { id: "wfp", name: "Dispatch worker (WFP)" },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Auto-suggests the tenant id (slug) from the name until the user edits it.
function SlugInput() {
  const { setValue } = useFormContext();
  const name = useWatch({ name: "friendly_name" }) as string | undefined;
  const edited = useRef(false);

  useEffect(() => {
    if (edited.current) return;
    setValue("id", slugify(name ?? ""));
  }, [name, setValue]);

  return (
    <TextInput
      source="id"
      label="Id"
      onChange={() => {
        edited.current = true;
      }}
    />
  );
}

function DeploymentFields() {
  const deploymentType = useWatch({ name: "deployment_type" }) as
    | string
    | undefined;

  if (deploymentType !== "wfp") return null;

  return (
    <p className="text-sm text-muted-foreground">
      A dedicated D1 database (Drizzle) will be provisioned for this tenant.
    </p>
  );
}

// Dispatch worker tenants always get their own D1 provisioned with Drizzle.
const transform = (data: Record<string, unknown>) => {
  if (data.deployment_type !== "wfp") return data;
  return {
    ...data,
    storage_kind: "own_d1",
    bundle_configuration: "authhero-drizzle-d1",
  };
};

export function TenantsCreate() {
  return (
    <Create transform={transform}>
      <SimpleForm>
        <TextInput source="friendly_name" label="Name" required />
        <SlugInput />
        <RadioButtonGroupInput
          source="deployment_type"
          choices={deploymentTypeChoices}
          defaultValue="shared"
        />
        <DeploymentFields />
      </SimpleForm>
    </Create>
  );
}
