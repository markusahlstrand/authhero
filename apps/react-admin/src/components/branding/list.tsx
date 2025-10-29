import { useEffect } from "react";
import { useRedirect, useBasename } from "react-admin";

export function BrandingList() {
  const redirect = useRedirect();
  const basename = useBasename();
  useEffect(() => {
    // For singleton resources, redirect to edit with "branding" as the ID
    redirect(`${basename}/branding/branding`);
  }, [redirect, basename]);
  return null;
}
