import { Layout, LayoutProps } from "react-admin";
import { TenantAppBar } from "./TenantAppBar";
import { ReactNode } from "react";

interface TenantLayoutProps extends LayoutProps {
  appBarProps?: {
    domainSelectorButton?: ReactNode;
  };
}

export function tenantLayout(props: TenantLayoutProps) {
  const { appBarProps, children, ...rest } = props;
  const tenantId = location.pathname.split("/").filter(Boolean)[0];
  const isDefaultSettings = tenantId === "DEFAULT_SETTINGS";

  return (
    <Layout
      {...rest}
      appBar={(appBarProps) => (
        <TenantAppBar
          {...appBarProps}
          domainSelectorButton={props.appBarProps?.domainSelectorButton}
        />
      )}
      sx={{ ...(isDefaultSettings && { backgroundColor: "red" }) }}
    >
      {children}
    </Layout>
  );
}
