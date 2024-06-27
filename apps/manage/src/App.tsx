import { Admin, Resource, ShowGuesser } from "react-admin";
import Group from "@mui/icons-material/Group";
import CloudQueue from "@mui/icons-material/CloudQueue";
import PickALogsIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import Layers from "@mui/icons-material/Layers";
import { getDataproviderForTenant } from "./dataProvider";
import { authProvider } from "./authProvider";
import {
  ApplicationCreate,
  ApplicationEdit,
  ApplicationsList,
} from "./components/applications";
import {
  ConnectionsList,
  ConnectionCreate,
  ConnectionEdit,
} from "./components/connections";
import { tenantLayout } from "./components/TenantLayout";
import { UserCreate, UserEdit, UsersList } from "./components/users";
import { DomainCreate, DomainEdit, DomainList } from "./components/domains";
import { LogsList, LogShow } from "./components/logs";

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
        name="applications"
        list={ApplicationsList}
        edit={ApplicationEdit}
        create={ApplicationCreate}
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
        name="domains"
        create={DomainCreate}
        list={DomainList}
        edit={DomainEdit}
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
