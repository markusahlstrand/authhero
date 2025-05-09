import { Admin, Resource, ShowGuesser } from "react-admin";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import PickALogsIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import Layers from "@mui/icons-material/Layers";
import { getDataproviderForTenant } from "./dataProvider";
import { getAuthProvider } from "./authProvider";
import { ClientCreate, ClientEdit, ClientList } from "./components/clients";
import {
  ConnectionsList,
  ConnectionCreate,
  ConnectionEdit,
} from "./components/connections";
import { tenantLayout } from "./components/TenantLayout";
import { UserCreate, UserEdit, UsersList } from "./components/users";
import {
  DomainCreate,
  DomainEdit,
  DomainList,
} from "./components/custom-domains";
import { LogsList, LogShow } from "./components/logs";
import { HookEdit, HookList, HooksCreate } from "./components/hooks";
import WebhookIcon from "@mui/icons-material/Webhook";
import DnsIcon from "@mui/icons-material/Dns";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@mui/material";
import { DomainSelector } from "./components/DomainSelector";
import {
  DomainConfig,
  getDomainFromCookies,
  saveDomainsToCookies,
  saveSelectedDomainToCookie,
} from "./utils/domainUtils";

interface AppProps {
  tenantId: string;
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function App(props: AppProps) {
  // State for domains and current selection with DomainConfig type
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>(
    props.initialDomain || "",
  );
  const [showDomainDialog, setShowDomainDialog] = useState<boolean>(false);

  // Load domains from cookies on component mount
  useEffect(() => {
    const savedDomains = getDomainFromCookies();
    if (savedDomains[0]) {
      setDomains(savedDomains);
      // If we have an initialDomain, use it; otherwise use the first domain
      if (!props.initialDomain && !selectedDomain) {
        setSelectedDomain(savedDomains[0].url);
      }
    } else {
      // Use environment variable as fallback if no saved domains
      const envDomain = import.meta.env.VITE_AUTH0_DOMAIN || "";
      const envClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "";
      if (envDomain) {
        const domainConfig = { url: envDomain, clientId: envClientId };
        setDomains([domainConfig]);
        setSelectedDomain(envDomain);
      } else {
        // Don't automatically show domain dialog, let Root component handle initial selection
        // Only set showDomainDialog to true if we're on the root path
        const isRootPath = window.location.pathname === "/";
        setShowDomainDialog(isRootPath);
      }
    }
  }, [props.initialDomain, selectedDomain]);

  // Use memoization for creating the auth provider to prevent re-authentication
  const authProvider = useMemo(() => {
    if (!selectedDomain) return null;
    saveSelectedDomainToCookie(selectedDomain);
    return getAuthProvider(selectedDomain, props.onAuthComplete);
  }, [selectedDomain, props.onAuthComplete]);

  // Save domains to cookies when they change
  useEffect(() => {
    if (domains.length > 0) {
      saveDomainsToCookies(domains);
    }
  }, [domains]);

  const handleDomainSelected = (domain: string) => {
    setSelectedDomain(domain);
    setShowDomainDialog(false);
  };

  const openDomainManager = () => {
    setShowDomainDialog(true);
  };

  // Memoize the data provider to prevent unnecessary re-creations
  const dataProvider = useMemo(
    () =>
      getDataproviderForTenant(
        props.tenantId,
        selectedDomain || import.meta.env.VITE_AUTH0_DOMAIN || "",
      ),
    [props.tenantId, selectedDomain],
  );

  // If no domain is selected and dialog is not open, show a loading state
  if (!authProvider || (!selectedDomain && !showDomainDialog)) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {showDomainDialog && (
        <DomainSelector onDomainSelected={handleDomainSelected} />
      )}

      <Admin
        dataProvider={dataProvider}
        authProvider={authProvider}
        requireAuth={!!selectedDomain} // Only require auth when domain is selected
        basename={`/${props.tenantId}`} // Set the basename to the tenant ID
        layout={(props) =>
          tenantLayout({
            ...props,
            appBarProps: {
              domainSelectorButton: (
                <Button
                  color="inherit"
                  onClick={openDomainManager}
                  sx={{ marginLeft: 1, textTransform: "none" }}
                >
                  Domain: {selectedDomain}
                </Button>
              ),
            },
          })
        }
      >
        <Resource
          icon={Layers}
          name="clients"
          list={ClientList}
          edit={ClientEdit}
          create={ClientCreate}
          show={ShowGuesser}
        />
        <Resource
          icon={CloudQueue}
          name="connections"
          list={ConnectionsList}
          create={ConnectionCreate}
          edit={ConnectionEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={Group}
          name="users"
          list={UsersList}
          edit={UserEdit}
          create={UserCreate}
          show={ShowGuesser}
        />
        <Resource
          icon={DnsIcon}
          name="domains"
          create={DomainCreate}
          list={DomainList}
          edit={DomainEdit}
        />
        <Resource
          icon={WebhookIcon}
          name="hooks"
          create={HooksCreate}
          list={HookList}
          edit={HookEdit}
        />
        <Resource
          icon={PickALogsIcon}
          name="logs"
          list={LogsList}
          show={LogShow}
        />
      </Admin>
    </>
  );
}
