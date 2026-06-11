import { useId } from "react";
import { useRecordContext } from "ra-core";
import { BadgeField, DataTable, List, TextInput } from "@/components/admin";
import { getBasePath } from "@/utils/runtimeConfig";

type TenantRecord = {
  id: string;
  deployment_type?: "shared" | "wfp";
  provisioning_state?: "pending" | "ready" | "failed";
  provisioning_error?: string;
};

const stateVariant: Record<
  NonNullable<TenantRecord["provisioning_state"]>,
  "default" | "outline" | "secondary" | "destructive"
> = {
  pending: "secondary",
  ready: "outline",
  failed: "destructive",
};

function ProvisioningStateField() {
  const record = useRecordContext<TenantRecord>();
  const state = record?.provisioning_state ?? "ready";
  const errorId = useId();
  const error = record?.provisioning_error;
  return (
    <span
      title={error}
      aria-describedby={error ? errorId : undefined}
    >
      <BadgeField
        source="provisioning_state"
        defaultValue={state}
        variant={stateVariant[state]}
      />
      {error ? (
        <span id={errorId} className="sr-only">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function TenantsList() {
  const filters = [
    <TextInput key="q" source="q" placeholder="Search" label={false} />,
  ];

  return (
    <List
      resource="tenants"
      filters={filters}
      sort={{ field: "friendly_name", order: "ASC" }}
    >
      <DataTable
        rowClick={(_id, _resource, record) => {
          window.location.href = `${getBasePath()}/${String(record.id)}`;
          return false;
        }}
      >
        <DataTable.Col source="friendly_name" label="Name" />
        <DataTable.Col source="id" />
        <DataTable.Col source="deployment_type" label="Deployment" />
        <DataTable.Col label="Status">
          <ProvisioningStateField />
        </DataTable.Col>
        <DataTable.Col source="audience" />
        <DataTable.Col source="support_url" label="Support URL" />
      </DataTable>
    </List>
  );
}
