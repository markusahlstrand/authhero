import { useEffect } from "react";
import { useRedirect, useBasename } from "react-admin";

export function SettingsList() {
  const redirect = useRedirect();
  const basename = useBasename();

  useEffect(() => {
    // For singleton resources with hasSingle: true, redirect to edit with the resource name as ID
    redirect(`${basename}/settings/settings`);
  }, [redirect, basename]);

  return null;
}
