import { Admin, Resource, ShowGuesser } from "react-admin";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import PickALogsIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
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
import {
  DomainCreate,
  DomainEdit,
  DomainList,
} from "./components/custom-domains";
import { BrandingList, BrandingEdit } from "./components/branding";
import { LogsList, LogShow } from "./components/logs";
import { HookEdit, HookList, HooksCreate } from "./components/hooks";
import { SessionsList, SessionEdit } from "./components/sessions";
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
import StorageIcon from "@mui/icons-material/Storage";
import { useMemo } from "react";
import { RoleCreate, RoleEdit, RoleList } from "./components/roles";
import SecurityIcon from "@mui/icons-material/Security";
import { SettingsList, SettingsEdit } from "./components/settings";

interface AppProps {
  tenantId: string;
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function App(props: AppProps) {
  // Use a default domain for now - in the working project, domain selection might be handled differently
  const selectedDomain =
    props.initialDomain || import.meta.env.VITE_AUTH0_DOMAIN || "";

  // Use memoization for creating the auth provider to prevent re-authentication
  const authProvider = useMemo(() => {
    if (!selectedDomain) return null;
    return getAuthProvider(selectedDomain, props.onAuthComplete);
  }, [selectedDomain, props.onAuthComplete]);

  // Memoize the data provider to prevent unnecessary re-creations
  const dataProvider = useMemo(
    () =>
      getDataproviderForTenant(
        props.tenantId,
        selectedDomain || import.meta.env.VITE_AUTH0_DOMAIN || "",
      ),
    [props.tenantId, selectedDomain],
  );

  // If no domain is selected, show a loading state
  if (!authProvider || !selectedDomain) {
    return <div>Loading...</div>;
  }

  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      requireAuth={!!selectedDomain} // Only require auth when domain is selected
      layout={tenantLayout}
    >
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
      <Resource icon={HistoryIcon} name="logs" list={LogsList} show={LogShow} />
      <Resource
        icon={PickALogsIcon}
        name="sessions"
        list={SessionsList}
        edit={SessionEdit}
        show={ShowGuesser}
      />
      <Resource
        icon={FormatAlignLeftIcon}
        name="forms"
        list={FormsList}
        create={FormCreate}
        edit={FormEdit}
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
  );
}
