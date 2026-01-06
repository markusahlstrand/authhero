import { Admin, Resource } from "react-admin";
import { getDataprovider } from "./dataProvider";
import { getAuthProvider, createAuth0Client } from "./authProvider";
import { TenantsList } from "./components/tenants/list";
import { TenantsCreate } from "./components/tenants/create";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@mui/material";
import { DomainSelector } from "./components/DomainSelector";
import { saveSelectedDomainToStorage } from "./utils/domainUtils";
import { tenantsLayout } from "./components/TenantsLayout";
import { CertificateErrorDialog } from "./components/CertificateErrorDialog";

interface TenantsAppProps {
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function TenantsApp(props: TenantsAppProps = {}) {
  const { initialDomain, onAuthComplete } = props;

  // State for domains and domain selector dialog
  const [selectedDomain, setSelectedDomain] = useState<string>(
    initialDomain || "",
  );
  const [showDomainDialog, setShowDomainDialog] = useState<boolean>(false);
  const [certErrorUrl, setCertErrorUrl] = useState<string | null>(null);
  const [isCheckingSingleTenant, setIsCheckingSingleTenant] =
    useState<boolean>(true);

  // Use useMemo to prevent recreating the auth provider on every render
  const authProvider = useMemo(
    () => getAuthProvider(selectedDomain, onAuthComplete),
    [selectedDomain, onAuthComplete],
  );

  // Get the dataProvider with the selected domain - also memoize this
  // Wrap it to catch certificate errors
  const dataProvider = useMemo(() => {
    const baseProvider = getDataprovider(
      selectedDomain || import.meta.env.VITE_AUTH0_DOMAIN || "",
    );

    // Wrap all methods to catch certificate errors
    const wrappedProvider: typeof baseProvider = {} as typeof baseProvider;
    for (const method of Object.keys(baseProvider) as Array<
      keyof typeof baseProvider
    >) {
      const original = baseProvider[method];
      if (typeof original === "function") {
        (wrappedProvider as any)[method] = async (...args: any[]) => {
          try {
            return await (original as Function).apply(baseProvider, args);
          } catch (error: any) {
            if (error?.isCertificateError && error?.serverUrl) {
              setCertErrorUrl(error.serverUrl);
            }
            throw error;
          }
        };
      }
    }
    return wrappedProvider;
  }, [selectedDomain]);

  // Check for single tenant mode on mount
  useEffect(() => {
    if (!selectedDomain) {
      setIsCheckingSingleTenant(false);
      return;
    }

    // Try to fetch tenants list
    dataProvider
      .getList("tenants", {
        pagination: { page: 1, perPage: 2 }, // Only need to know if there's 1 or more
        sort: { field: "id", order: "ASC" },
        filter: {},
      })
      .then((result) => {
        // Multi-tenant mode - tenants endpoint exists
        // Mark as multi-tenant and show the tenants list (don't auto-redirect)
        sessionStorage.setItem("isSingleTenant", `${selectedDomain}|false`);
        setIsCheckingSingleTenant(false);
      })
      .catch(async (error) => {
        console.log("Tenants endpoint check:", error);
        // If we get a 404 or any error, the tenants endpoint doesn't exist
        // In single-tenant mode without multi-tenancy package, the endpoint won't exist

        // Mark as single-tenant mode immediately (before trying to fetch settings)
        // This ensures subsequent requests won't try to use organization tokens
        sessionStorage.setItem("isSingleTenant", `${selectedDomain}|true`);

        // Try to use the /tenants/settings endpoint which works in single-tenant mode
        // We need to get a token and make a direct fetch to avoid organization logic
        try {
          const apiUrl = selectedDomain.startsWith("http")
            ? selectedDomain
            : `https://${selectedDomain}`;

          // Get a non-org token
          const auth0Client = createAuth0Client(selectedDomain);
          const token = await auth0Client.getTokenSilently();

          const response = await fetch(`${apiUrl}/api/v2/tenants/settings`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const settings = await response.json();
            if (settings?.id) {
              window.location.href = `/${settings.id}`;
              return;
            }
          }
        } catch (settingsError) {
          console.log("Settings endpoint also failed:", settingsError);
        }

        // If both endpoints fail, clear the flag and show the tenants list (which will show an error)
        sessionStorage.removeItem("isSingleTenant");
        setIsCheckingSingleTenant(false);
      });
  }, [selectedDomain, dataProvider]);

  const openDomainManager = () => {
    setShowDomainDialog(true);
  };

  const handleDomainSelected = (domain: string) => {
    setSelectedDomain(domain);
    setShowDomainDialog(false);
    saveSelectedDomainToStorage(domain);
  };

  const handleCloseCertError = () => {
    setCertErrorUrl(null);
  };

  // Show loading while checking for single tenant
  if (isCheckingSingleTenant) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Checking tenant configuration...
      </div>
    );
  }

  // Create the domain selector button that will be passed to the AppBar
  const DomainSelectorButton = (
    <Button
      color="inherit"
      onClick={openDomainManager}
      sx={{ marginLeft: 1, textTransform: "none" }}
    >
      Domain: {selectedDomain}
    </Button>
  );

  return (
    <>
      {showDomainDialog && (
        <DomainSelector onDomainSelected={handleDomainSelected} />
      )}

      <CertificateErrorDialog
        open={!!certErrorUrl}
        serverUrl={certErrorUrl || ""}
        onClose={handleCloseCertError}
      />

      <Admin
        dataProvider={dataProvider}
        authProvider={authProvider}
        requireAuth={false}
        layout={(props) =>
          tenantsLayout({
            ...props,
            domainSelectorButton: DomainSelectorButton,
          })
        }
      >
        <Resource name="tenants" list={TenantsList} create={TenantsCreate} />
      </Admin>
    </>
  );
}
