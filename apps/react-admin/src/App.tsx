import { Admin, Resource, ShowGuesser } from "react-admin";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import PickALogsIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import Layers from "@mui/icons-material/Layers";
import { getDataproviderForTenant } from "./dataProvider";
import { authProvider } from "./authProvider";
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

interface AppProps {
  tenantId: string;
}

export function App(props: AppProps) {
  const dataProvider = getDataproviderForTenant(props.tenantId);

  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      layout={tenantLayout}
      requireAuth
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
  );
}
