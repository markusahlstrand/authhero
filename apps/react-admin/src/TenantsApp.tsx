import { Admin, Resource, ShowGuesser } from "react-admin";
import { getDataprovider } from "./dataProvider";
import { authProvider } from "./authProvider";
import { TenantsCreate, TenantsList } from "./components/tenants";
import { TenantsEdit } from "./components/tenants/edit";

export function TenantsApp() {
  const dataProvider = getDataprovider();

  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider}>
      <Resource
        name="tenants"
        list={TenantsList}
        edit={TenantsEdit}
        create={TenantsCreate}
        show={ShowGuesser}
      />
    </Admin>
  );
}
