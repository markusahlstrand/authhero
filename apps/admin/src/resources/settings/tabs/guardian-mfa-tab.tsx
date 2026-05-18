import { BooleanInput, TextInput } from "@/components/admin";

export function GuardianMfaTab() {
  return (
    <div className="flex flex-col gap-3">
      <BooleanInput source="guardian_mfa_page.enabled" label="Enabled" />
      <TextInput
        source="guardian_mfa_page.html"
        label="Custom HTML"
        multiline
      />
    </div>
  );
}
