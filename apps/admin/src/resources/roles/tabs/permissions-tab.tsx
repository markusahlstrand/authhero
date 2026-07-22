import { PermissionsTab as SharedPermissionsTab } from "@/components/PermissionsTab";

export function PermissionsTab() {
  return (
    <SharedPermissionsTab
      resource="roles"
      target="role_id"
      subjectNoun="role"
    />
  );
}
