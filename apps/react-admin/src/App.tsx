import { Admin, Resource, ShowGuesser } from "react-admin";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import PickALogsIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import Layers from "@mui/icons-material/Layers";
import HistoryIcon from "@mui/icons-material/History";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
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
import { LogsList, LogShow } from "./components/logs";
import { HookEdit, HookList, HooksCreate } from "./components/hooks";
import { SessionsList, SessionEdit } from "./components/sessions";
import { BrandingEdit, BrandingShow } from "./components/branding";
import WebhookIcon from "@mui/icons-material/Webhook";
import DnsIcon from "@mui/icons-material/Dns";
import PaletteIcon from "@mui/icons-material/Palette";
import { useMemo } from "react";

interface AppProps {
  tenantId: string;
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function App(props: AppProps) {
  // Use the domain passed from parent component
  const selectedDomain = props.initialDomain || "";

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
      basename={`/${props.tenantId}`} // Set the basename to the tenant ID
      layout={tenantLayout}
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
        icon={PaletteIcon}
        name="branding"
        show={BrandingShow}
        edit={BrandingEdit}
      />
      <Resource
        icon={DnsIcon}
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
        icon={PickALogsIcon}
        name="logs"
        list={LogsList}
        show={LogShow}
      />
      <Resource
        icon={HistoryIcon}
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
    </Admin>
  );
}
