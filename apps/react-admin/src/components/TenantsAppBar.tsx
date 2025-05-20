// Create a custom AppBar specifically for TenantsApp
import { AppBar as ReactAdminAppBar, TitlePortal } from "react-admin";
import { Box } from "@mui/material";

interface TenantsAppBarProps {
  domainSelectorButton?: React.ReactNode;
  [key: string]: any;
}

export function TenantsAppBar(props: TenantsAppBarProps) {
  const { domainSelectorButton, ...rest } = props;
  
  return (
    <ReactAdminAppBar {...rest}>
      <TitlePortal />
      <Box sx={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "flex-end" }}>
        {domainSelectorButton}
      </Box>
    </ReactAdminAppBar>
  );
}