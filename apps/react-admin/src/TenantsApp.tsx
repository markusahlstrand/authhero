import { Admin, Resource } from "react-admin";
import { getDataprovider } from "./dataProvider";
import { getAuthProvider } from "./authProvider";
import { TenantsList } from "./components/tenants/list";
import { TenantsCreate } from "./components/tenants/create";
import { useMemo, useState } from "react";
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
