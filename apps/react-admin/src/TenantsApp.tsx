import { Admin, Resource, ShowGuesser } from "react-admin";
import { getDataprovider } from "./dataProvider";
import { getAuthProvider } from "./authProvider";
import { TenantsList } from "./components/tenants/list";
import { TenantsEdit } from "./components/tenants/edit";
import { TenantsCreate } from "./components/tenants/create";
import { useMemo } from "react";

interface TenantsAppProps {
  initialDomain: string;
  onAuthComplete?: () => void;
}

export function TenantsApp({ initialDomain, onAuthComplete }: TenantsAppProps) {
  // Use useMemo to prevent recreating the auth provider on every render
  const authProvider = useMemo(
    () => getAuthProvider(initialDomain, onAuthComplete),
    [initialDomain, onAuthComplete],
  );

  // Get the dataProvider with the selected domain - also memoize this
  const dataProvider = useMemo(
    () =>
      getDataprovider(initialDomain || import.meta.env.VITE_AUTH0_DOMAIN || ""),
    [initialDomain],
  );

  // Use a direct component approach with React Admin's functionality
  const AdminWithBasename = () => {
    // We don't need a custom basename when rendering TenantsApp
    // The route is already set to "/tenants/*" in index.tsx
    // Using an empty string prevents the duplication
    const basename = "";

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
