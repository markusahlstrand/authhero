import { BooleanInput, TextInput } from "@/components/admin";

export function ErrorPageTab() {
  return (
    <div className="flex flex-col gap-3">
      <TextInput source="error_page.url" label="Error Page URL" />
      <TextInput source="error_page.html" label="Error Page HTML" multiline />
      <BooleanInput
        source="error_page.show_log_link"
        label="Show Log Link"
      />
    </div>
  );
}
