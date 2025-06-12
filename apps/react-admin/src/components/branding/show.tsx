import {
  Show,
  SimpleShowLayout,
  TextField,
  EditButton,
  TopToolbar,
} from "react-admin";

const BrandingShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
);

export function BrandingShow() {
  return (
    <Show actions={<BrandingShowActions />} id="current">
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="language" />
        <TextField source="primary_color" />
        <TextField source="secondary_color" />
        <TextField source="logo" />
        <TextField source="sender_email" />
        <TextField source="sender_name" />
        <TextField source="audience" />
        <TextField source="support_url" />
      </SimpleShowLayout>
    </Show>
  );
}
