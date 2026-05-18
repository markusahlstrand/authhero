import { useRecordContext } from "ra-core";
import { useWatch } from "react-hook-form";
import { BooleanInput } from "@/components/admin";

export function RbacTab() {
  const record = useRecordContext<{ is_system?: boolean }>();
  const isSystem = !!record?.is_system;
  const enforcePolicies = useWatch({ name: "options.enforce_policies" });

  return (
    <div className="flex flex-col gap-4">
      <BooleanInput
        source="options.enforce_policies"
        label="Enable RBAC"
        helperText="Enable Role-Based Access Control for this resource server"
        disabled={isSystem}
      />
      <BooleanInput
        source="options.token_dialect"
        label="Add permissions in token"
        helperText="Include permissions directly in the access token"
        disabled={isSystem || !enforcePolicies}
        format={(value) => value === "access_token_authz"}
        parse={(checked) => (checked ? "access_token_authz" : "access_token")}
      />
    </div>
  );
}
