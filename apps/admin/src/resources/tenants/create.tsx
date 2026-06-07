import { useWatch } from "react-hook-form";
import {
  Create,
  RadioButtonGroupInput,
  SelectInput,
  SimpleForm,
  TextInput,
} from "@/components/admin";

const deploymentTypeChoices = [
  { id: "shared", name: "Shared (default)" },
  { id: "wfp", name: "Dispatch worker (WFP)" },
];

const storageKindChoices = [
  { id: "own_d1", name: "Own D1 (provision a new D1)" },
  { id: "existing_d1", name: "Existing D1 (bind by ID)" },
  { id: "shared_planetscale", name: "Shared PlanetScale" },
];

const bundleConfigurationChoices = [
  { id: "authhero-drizzle-d1", name: "authhero-drizzle-d1" },
  { id: "authhero-kysely-planetscale", name: "authhero-kysely-planetscale" },
];

function DeploymentFields() {
  const deploymentType = useWatch({ name: "deployment_type" }) as
    | string
    | undefined;
  const storageKind = useWatch({ name: "storage_kind" }) as string | undefined;

  if (deploymentType !== "wfp") return null;

  return (
    <>
      <RadioButtonGroupInput
        source="storage_kind"
        choices={storageKindChoices}
      />
      <SelectInput
        source="bundle_configuration"
        choices={bundleConfigurationChoices}
      />
      {storageKind === "existing_d1" ? (
        <TextInput source="d1_database_id" label="D1 database ID" />
      ) : null}
    </>
  );
}

export function TenantsCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="id" />
        <TextInput source="friendly_name" label="Name" required />
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
