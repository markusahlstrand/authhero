import { TextInput } from "@/components/admin";

export function GeneralTab() {
  return (
    <div className="flex flex-col gap-3">
      <TextInput source="friendly_name" label="Friendly Name" />
      <TextInput source="picture_url" label="Picture URL" />
      <TextInput source="support_email" label="Support Email" />
      <TextInput source="support_url" label="Support URL" />
      <TextInput source="default_directory" label="Default Directory" />
      <TextInput source="default_audience" label="Default Audience" />
      <TextInput source="default_organization" label="Default Organization" />
      <TextInput
        source="default_redirection_uri"
        label="Default Redirection URI"
      />
    </div>
  );
}
