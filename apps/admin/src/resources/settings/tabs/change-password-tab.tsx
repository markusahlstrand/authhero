import { BooleanInput, TextInput } from "@/components/admin";

export function ChangePasswordTab() {
  return (
    <div className="flex flex-col gap-3">
      <BooleanInput source="change_password.enabled" label="Enabled" />
      <TextInput source="change_password.html" label="Custom HTML" multiline />
    </div>
  );
}
