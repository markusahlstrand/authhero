import { PermissionsTab as SharedPermissionsTab } from "@/components/PermissionsTab";

export function PermissionsTab() {
  return (
    <SharedPermissionsTab
      resource="users"
      target="user_id"
      subjectNoun="user"
      withOrgScope
    />
  );
}
