import { ArrayInput, SimpleFormIterator, TextInput } from "@/components/admin";

export function LocalizationTab() {
  return (
    <ArrayInput source="enabled_locales" label="Enabled Locales">
      <SimpleFormIterator inline>
        <TextInput source="" label="" helperText="e.g., en, es, fr" />
      </SimpleFormIterator>
    </ArrayInput>
  );
}
