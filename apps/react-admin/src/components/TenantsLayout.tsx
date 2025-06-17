import { Layout, LayoutProps, AppBar, TitlePortal } from "react-admin";
import { Box } from "@mui/material";
import { ReactNode } from "react";

// Custom AppBar specifically for the Tenants management interface
const TenantsListAppBar = ({ domainSelectorButton, ...rest }) => {
  return (
    <AppBar {...rest}>
      <TitlePortal />
      <Box flex={1} />
      {domainSelectorButton}
    </AppBar>
  );
};

interface TenantsLayoutProps extends LayoutProps {
  domainSelectorButton?: ReactNode;
}

// Custom layout for the TenantsApp component
export function tenantsLayout(props: TenantsLayoutProps) {
  const { domainSelectorButton, children, ...rest } = props;

  return (
    <Layout
      {...rest}
      appBar={(appBarProps) => (
        <TenantsListAppBar
          {...appBarProps}
          domainSelectorButton={domainSelectorButton}
        />
      )}
    >
      {children}
    </Layout>
  );
}
