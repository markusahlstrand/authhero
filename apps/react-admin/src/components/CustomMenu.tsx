import { Menu, useBasename } from "react-admin";
import { MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import PaletteIcon from "@mui/icons-material/Palette";
import { Link } from "react-router-dom";

export function CustomMenu(props) {
  const basename = useBasename();

  return (
    <Menu {...props}>
      <Menu.ResourceItem name="clients" />
      <Menu.ResourceItem name="connections" />
      <Menu.ResourceItem name="users" />

      {/* Custom Branding Menu Item */}
      <MenuItem
        component={Link}
        to={`${basename}/branding/current/edit`}
        sx={{
          color: "inherit",
          textDecoration: "none",
          minHeight: 48,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <PaletteIcon />
        </ListItemIcon>
        <ListItemText primary="Branding" />
      </MenuItem>

      <Menu.ResourceItem name="custom-domains" />
      <Menu.ResourceItem name="hooks" />
      <Menu.ResourceItem name="logs" />
      <Menu.ResourceItem name="sessions" />
      <Menu.ResourceItem name="forms" />
    </Menu>
  );
}
