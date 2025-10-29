import { useEffect } from "react";
import { useRedirect, useBasename } from "react-admin";

export function SettingsList() {
  const redirect = useRedirect();
  const basename = useBasename();

  useEffect(() => {
    // For singleton resources, redirect to edit with "settings" as the ID
    redirect(`${basename}/settings/settings/edit`);
  }, [redirect, basename]);

  return null;
}
