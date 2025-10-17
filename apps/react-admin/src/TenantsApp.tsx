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

  // Use useMemo to prevent recreating the auth provider on every render
  const authProvider = useMemo(
    () => getAuthProvider(selectedDomain, onAuthComplete),
    [selectedDomain, onAuthComplete],
  );

  // Get the dataProvider with the selected domain - also memoize this
  const dataProvider = useMemo(
    () =>
      getDataprovider(
        selectedDomain || import.meta.env.VITE_AUTH0_DOMAIN || "",
      ),
    [selectedDomain],
  );

  const openDomainManager = () => {
    setShowDomainDialog(true);
  };

  const handleDomainSelected = (domain: string) => {
    setSelectedDomain(domain);
    setShowDomainDialog(false);
    saveSelectedDomainToStorage(domain);
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
