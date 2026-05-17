import { SettingsEdit } from "./edit";

// Singleton resource — render the edit form at the list URL
// so the path stays /settings instead of /settings/settings.
export function SettingsList() {
  return <SettingsEdit id="settings" />;
}
