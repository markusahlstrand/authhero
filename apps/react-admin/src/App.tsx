import { Admin, Resource, ShowGuesser, CustomRoutes } from "react-admin";
import { Route } from "react-router-dom";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import Layers from "@mui/icons-material/Layers";
import HistoryIcon from "@mui/icons-material/History";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import BusinessIcon from "@mui/icons-material/Business";
import SettingsIcon from "@mui/icons-material/Settings";
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
import { FormCreate, FormEdit, FormsList } from "./components/forms";
import { FlowCreate, FlowEdit, FlowsList } from "./components/flows";
import {
  DomainCreate,
  DomainEdit,
  DomainList,
} from "./components/custom-domains";
import { BrandingList, BrandingEdit } from "./components/branding";
import { PromptsList, PromptsEdit } from "./components/prompts";
import { LogsList, LogShow } from "./components/logs";
import { HookEdit, HookList, HooksCreate } from "./components/hooks";
import { SessionEdit } from "./components/sessions";
import {
  ResourceServerCreate,
  ResourceServerEdit,
  ResourceServerList,
} from "./components/resource-servers";
import {
  OrganizationCreate,
  OrganizationEdit,
  OrganizationList,
} from "./components/organizations";
import WebhookIcon from "@mui/icons-material/Webhook";
import DnsIcon from "@mui/icons-material/Dns";
import PaletteIcon from "@mui/icons-material/Palette";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import StorageIcon from "@mui/icons-material/Storage";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { useMemo, useState, useEffect } from "react";
import { RoleCreate, RoleEdit, RoleList } from "./components/roles";
import SecurityIcon from "@mui/icons-material/Security";
import { SettingsList, SettingsEdit } from "./components/settings";
import { CertificateErrorDialog } from "./components/CertificateErrorDialog";
import { ActivityDashboard } from "./components/activity";
import { buildUrlWithProtocol } from "./utils/domainUtils";

interface AppProps {
  tenantId: string;
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function App(props: AppProps) {
  const [certErrorUrl, setCertErrorUrl] = useState<string | null>(null);
  
  // Use a default domain for now - in the working project, domain selection might be handled differently
  const selectedDomain =
    props.initialDomain || import.meta.env.VITE_AUTH0_DOMAIN || "";

  // Check if we've already verified single-tenant mode for THIS domain
  // The flag is stored as "domain|true" or "domain|false" to ensure we re-check when domain changes
  // Using | as separator since domains can contain : (e.g., localhost:3000)
  const storedFlag = sessionStorage.getItem('isSingleTenant');
  const separatorIndex = storedFlag?.lastIndexOf('|') ?? -1;
  const [storedDomain, storedValue] = separatorIndex > -1
    ? [storedFlag!.substring(0, separatorIndex), storedFlag!.substring(separatorIndex + 1)]
    : [null, storedFlag];
  
  const [isSingleTenantChecked, setIsSingleTenantChecked] = useState<boolean>(
    // Only skip check if we have a flag for the SAME domain
    storedDomain === selectedDomain && storedValue !== null
  );

  // Check for single-tenant mode on mount if not already checked
  // This handles the case where user navigates directly to /{tenantId} without going through /tenants
  useEffect(() => {
    if (isSingleTenantChecked || !selectedDomain) {
      return;
    }

    const checkSingleTenant = async () => {
      const apiUrl = buildUrlWithProtocol(selectedDomain);
      try {
        // Try to fetch the tenants endpoint - if it exists, we're in multi-tenant mode
        const response = await fetch(`${apiUrl}/api/v2/tenants?per_page=1`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        // If we get a 401/403 (auth required) or 200, the endpoint exists -> multi-tenant
        // If we get a 404, the endpoint doesn't exist -> single-tenant
        if (response.status === 404) {
          // Store domain|value so we know which domain was checked (using | since domain can contain :)
          sessionStorage.setItem('isSingleTenant', `${selectedDomain}|true`);
        } else {
          sessionStorage.setItem('isSingleTenant', `${selectedDomain}|false`);
        }
      } catch {
        // Network error or endpoint doesn't exist -> assume single-tenant
        sessionStorage.setItem('isSingleTenant', `${selectedDomain}|true`);
      }
      setIsSingleTenantChecked(true);
    };

    checkSingleTenant();
  }, [selectedDomain, isSingleTenantChecked]);

  // Use memoization for creating the auth provider to prevent re-authentication
  const authProvider = useMemo(() => {
    if (!selectedDomain) return null;
    return getAuthProvider(selectedDomain, props.onAuthComplete);
  }, [selectedDomain, props.onAuthComplete]);

  // Memoize the data provider to prevent unnecessary re-creations
  // Wrap it to catch certificate errors
  // Re-create when isSingleTenantChecked changes to pick up the new sessionStorage value
  const dataProvider = useMemo(() => {
    const baseProvider = getDataproviderForTenant(
      props.tenantId,
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
  }, [props.tenantId, selectedDomain, isSingleTenantChecked]);

  const handleCloseCertError = () => {
    setCertErrorUrl(null);
  };

  // If not done checking single-tenant mode, show loading
  if (!isSingleTenantChecked) {
    return <div>Checking tenant mode...</div>;
  }

  // If no domain is selected, show a loading state
  if (!authProvider || !selectedDomain) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <CertificateErrorDialog
        open={!!certErrorUrl}
        serverUrl={certErrorUrl || ""}
        onClose={handleCloseCertError}
      />
      <Admin
        dataProvider={dataProvider}
        authProvider={authProvider}
        requireAuth={!!selectedDomain} // Only require auth when domain is selected
        layout={tenantLayout}
        dashboard={ActivityDashboard}
      >
        <CustomRoutes>
          <Route path="/activity" element={<ActivityDashboard />} />
        </CustomRoutes>
        <Resource
          icon={DnsIcon}
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
          icon={Layers}
          name="custom-domains"
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
          icon={HistoryIcon}
          name="logs"
          list={LogsList}
          show={LogShow}
        />
        <Resource name="sessions" edit={SessionEdit} show={ShowGuesser} />
        <Resource
          icon={FormatAlignLeftIcon}
          name="forms"
          list={FormsList}
          create={FormCreate}
          edit={FormEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={AccountTreeIcon}
          name="flows"
          list={FlowsList}
          create={FlowCreate}
          edit={FlowEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={PaletteIcon}
          name="branding"
          options={{ hasSingle: true }}
          list={BrandingList}
          edit={BrandingEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={TextFieldsIcon}
          name="prompts"
          options={{ hasSingle: true }}
          list={PromptsList}
          edit={PromptsEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={StorageIcon}
          name="resource-servers"
          list={ResourceServerList}
          create={ResourceServerCreate}
          edit={ResourceServerEdit}
          show={ShowGuesser}
        />
        <Resource name="permissions" />
        <Resource
          icon={SecurityIcon}
          name="roles"
          list={RoleList}
          create={RoleCreate}
          edit={RoleEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={BusinessIcon}
          name="organizations"
          list={OrganizationList}
          create={OrganizationCreate}
          edit={OrganizationEdit}
          show={ShowGuesser}
        />
        <Resource
          icon={SettingsIcon}
          name="settings"
          list={SettingsList}
          edit={SettingsEdit}
          options={{ hasSingle: true }}
        />
      </Admin>
    </>
  );
}
