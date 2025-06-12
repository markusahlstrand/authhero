import { Layout, LayoutProps } from "react-admin";
import { TenantAppBar } from "./TenantAppBar";
import { ReactNode } from "react";

interface TenantLayoutProps extends LayoutProps {
  appBarProps?: {
    domainSelectorButton?: ReactNode;
  };
  menu?: React.ComponentType<any>;
}

export function tenantLayout(props: TenantLayoutProps) {
  const { appBarProps, children, menu, ...rest } = props;
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
      menu={menu}
      sx={{ ...(isDefaultSettings && { backgroundColor: "red" }) }}
    >
      {children}
    </Layout>
  );
}
