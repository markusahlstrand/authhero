import { AppBar, TitlePortal } from "react-admin";
import { useEffect, useState } from "react";
import { Link, Box } from "@mui/material";
import { authorizedHttpClient } from "../authProvider";

type TenantResponse = {
  audience: string;
  created_at: string;
  id: string;
  language: string;
  logo: string;
  updated_at: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  sender_email: string;
  sender_name: string;
};

interface TenantAppBarProps {
  domainSelectorButton?: React.ReactNode;
  [key: string]: any;
}

export function TenantAppBar(props: TenantAppBarProps) {
  const { domainSelectorButton, ...rest } = props;
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const tenantId = pathSegments[0];
  const [tenant, setTenant] = useState<TenantResponse>();

  useEffect(() => {
    authorizedHttpClient(
      `${import.meta.env.VITE_SIMPLE_REST_URL}/api/v2/tenants/${tenantId}`,
      {},
    ).then((response) => {
      const res: TenantResponse = JSON.parse(response.body);
      setTenant(res);
    });
  }, [tenantId]);

  const isDefaultSettings = tenantId === "DEFAULT_SETTINGS";

  return (
    <AppBar
      {...rest}
      sx={{
        ...rest.sx,
        ...(isDefaultSettings && { backgroundColor: "red" }),
      }}
    >
      <TitlePortal />
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <p>{tenant?.name}&nbsp;-&nbsp;</p>
        <Link color="inherit" href="/tenants" underline="none" sx={{ mr: 2 }}>
          Tenants
        </Link>
        {domainSelectorButton}
      </Box>
    </AppBar>
  );
}
