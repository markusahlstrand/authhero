import { AppBar, TitlePortal, useDataProvider } from "react-admin";
import { useEffect, useState } from "react";
import { Link, Box } from "@mui/material";

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
  const dataProvider = useDataProvider();

  useEffect(() => {
    // Use the dataProvider to fetch tenants list and find the matching one
    // This ensures we use the correct API URL configured in the app
    dataProvider
      .getList("tenants", {
        pagination: { page: 1, perPage: 100 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      })
      .then((result) => {
        const foundTenant = result.data.find(
          (t: any) => t.id === tenantId || t.tenant_id === tenantId,
        );
        if (foundTenant) {
          setTenant(foundTenant as TenantResponse);
        } else {
          // Set a minimal tenant object if not found
          setTenant({
            id: tenantId,
            name: tenantId,
          } as TenantResponse);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch tenant:", error);
        // Set a minimal tenant object on error
        setTenant({
          id: tenantId,
          name: tenantId,
        } as TenantResponse);
      });
  }, [tenantId, dataProvider]);

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
        <Link color="inherit" href="/tenants" underline="none" sx={{ mr: 2 }}>
          {tenant?.name || tenantId || "Unknown"} - Tenants
        </Link>
        {domainSelectorButton}
      </Box>
    </AppBar>
  );
}
