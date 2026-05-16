import { createContext, useContext, type ReactNode } from "react";

const TenantContext = createContext<string | undefined>(undefined);

export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenantId}>{children}</TenantContext.Provider>
  );
}

export function useTenantId(): string | undefined {
  return useContext(TenantContext);
}
