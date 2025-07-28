import { List, Datagrid, TextField } from "react-admin";

export function ThemesList() {
  return (
    <List>
      <Datagrid>
        <TextField source="displayName" />
        <TextField source="themeId" />
      </Datagrid>
    </List>
  );
}
