import { useEffect } from "react";
import { useRedirect, useBasename } from "react-admin";

export function BrandingList() {
  const redirect = useRedirect();
  const basename = useBasename();
  useEffect(() => {
    // Prepend the tenant id (basename) to the singleton branding show view
    redirect(`${basename}/branding/branding/edit`);
  }, [redirect, basename]);
  return null;
}
