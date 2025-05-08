import { Admin, Resource, ShowGuesser } from "react-admin";
import { getDataprovider } from "./dataProvider";
import { getAuthProvider } from "./authProvider";
import { TenantsList } from "./components/tenants/list";
import { TenantsEdit } from "./components/tenants/edit";
import { TenantsCreate } from "./components/tenants/create";

interface TenantsAppProps {
  initialDomain: string;
}

export function TenantsApp({ initialDomain }: TenantsAppProps) {
  const authProvider = getAuthProvider(initialDomain);

  // Get the dataProvider with the selected domain
  const dataProvider = getDataprovider(
    initialDomain || import.meta.env.VITE_AUTH0_DOMAIN || "",
  );

  // Use a direct component approach with React Admin's functionality
  const AdminWithBasename = () => {
    // Extract the base path to avoid duplicate "tenants" in the URL
    // If we're on /tenants/* route, use /tenants as basename
    // Otherwise, use empty string as basename
    const pathname = window.location.pathname;
    const isTenantsRoute = pathname.startsWith("/tenants");
    const basename = isTenantsRoute ? "/tenants" : "";

    return (
      <Admin
        dataProvider={dataProvider}
        authProvider={authProvider}
        requireAuth={false}
        basename={basename}
        // Create a dashboard component that passes the resource prop
        dashboard={() => <TenantsList resource="tenants" />}
      >
        <Resource
          name="tenants"
          list={TenantsList}
          edit={TenantsEdit}
          create={TenantsCreate}
          show={ShowGuesser}
        />
      </Admin>
    );
  };

  return <AdminWithBasename />;
}
