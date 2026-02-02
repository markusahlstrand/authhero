import { AppBar, TitlePortal } from "react-admin";
import { useEffect, useState, useMemo } from "react";
import { Link, Box } from "@mui/material";
import { getDataprovider } from "../dataProvider";
import { getSelectedDomainFromStorage } from "../utils/domainUtils";

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

  // Get the selected domain from storage or environment
  const selectedDomain = useMemo(() => {
    const selected = getSelectedDomainFromStorage();
    return selected || import.meta.env.VITE_AUTH0_DOMAIN || "";
  }, []);

  // Use the non-org data provider for fetching tenants list
  // This is necessary because tenants list requires a non-org token
  const tenantsDataProvider = useMemo(
    () => getDataprovider(selectedDomain),
    [selectedDomain],
  );

  useEffect(() => {
    // Use the non-org dataProvider to fetch tenants list
    // The tenants endpoint requires non-org scoped tokens
    tenantsDataProvider
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
      .catch(async (error) => {
        console.error("Failed to fetch tenant list:", error);

        // In single-tenant mode, the tenants list endpoint might not exist
        // Try to fetch from the settings endpoint instead
        try {
          const settings = await tenantsDataProvider.getOne("tenants", {
            id: "settings",
          });

          if (settings?.data && settings.data.id === tenantId) {
            setTenant(settings.data as TenantResponse);
            return;
          }
        } catch (settingsError) {
          console.error("Failed to fetch tenant settings:", settingsError);
        }

        // Set a minimal tenant object on error
        setTenant({
          id: tenantId,
          name: tenantId,
        } as TenantResponse);
      });
  }, [tenantId, tenantsDataProvider]);

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
