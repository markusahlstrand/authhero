import { Layout } from "react-admin";

import { TenantAppBar } from "./TenantAppBar";

export function tenantLayout(props: any) {
  const tenantId = location.pathname.split("/").filter(Boolean)[0];

  const isDefaultSettings = tenantId === "DEFAULT_SETTINGS";

  return (
    <Layout
      {...props}
      appBar={TenantAppBar}
      sx={{ ...(isDefaultSettings && { backgroundColor: "red" }) }}
    />
  );
}
