import { useEffect, useMemo, useState } from "react";
import { CustomRoutes, Resource } from "ra-core";
import { Route } from "react-router-dom";
import { Admin } from "@/components/admin";
import { getAuthProvider, createAuth0Client } from "./authProvider";
import { getDataprovider, resolveApiBase } from "./dataProvider";
import { getConfigValue, getBasePath } from "./utils/runtimeConfig";
import { TenantsList } from "./resources/tenants/list";
import { TenantsCreate } from "./resources/tenants/create";
import { TenantMembers } from "./resources/tenants/members";
import { TenantOperations } from "./resources/tenants/operations";
import { Loader2 } from "lucide-react";

interface TenantsAppProps {
  initialDomain?: string;
  onAuthComplete?: () => void;
}

export function TenantsApp({ initialDomain, onAuthComplete }: TenantsAppProps) {
  const [selectedDomain] = useState<string>(
    initialDomain || getConfigValue("domain") || "",
  );
  const [isCheckingSingleTenant, setIsCheckingSingleTenant] = useState(true);

  const authProvider = useMemo(
    () => getAuthProvider(selectedDomain, onAuthComplete),
    [selectedDomain, onAuthComplete],
  );

  const dataProvider = useMemo(
    () => getDataprovider(selectedDomain),
    [selectedDomain],
  );

  useEffect(() => {
    if (!selectedDomain) {
      setIsCheckingSingleTenant(false);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    dataProvider
      .getList("tenants", {
        pagination: { page: 1, perPage: 2 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      })
      .then(() => {
        if (cancelled) return;
        sessionStorage.setItem("isSingleTenant", `${selectedDomain}|false`);
        setIsCheckingSingleTenant(false);
      })
      .catch(async () => {
        if (cancelled) return;
        sessionStorage.setItem("isSingleTenant", `${selectedDomain}|true`);
        try {
          const apiUrl = resolveApiBase(selectedDomain);
          const auth0Client = createAuth0Client(selectedDomain);
          const token = await auth0Client.getTokenSilently();
          if (cancelled) return;
          const response = await fetch(`${apiUrl}/api/v2/tenants/settings`, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: abortController.signal,
          });
          if (cancelled) return;
          if (response.ok) {
            const settings = await response.json();
            if (settings?.id) {
              window.location.href = `${getBasePath()}/${settings.id}`;
              return;
            }
          }
        } catch {
          // ignore
        }
        if (cancelled) return;
        sessionStorage.removeItem("isSingleTenant");
        setIsCheckingSingleTenant(false);
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [selectedDomain, dataProvider]);

  if (isCheckingSingleTenant) {
    return (
      <div className="flex items-center justify-center h-screen gap-3">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Checking tenant configuration…</span>
      </div>
    );
  }

  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      requireAuth={false}
    >
      <Resource name="tenants" list={TenantsList} create={TenantsCreate} />
      <Resource name="organization-members" />
      <Resource name="organization-invitations" />
      <Resource name="users" />
      <CustomRoutes>
        <Route path="/tenants/:tenantId/members" element={<TenantMembers />} />
        <Route
          path="/tenants/:tenantId/operations"
          element={<TenantOperations />}
        />
      </CustomRoutes>
    </Admin>
  );
}
