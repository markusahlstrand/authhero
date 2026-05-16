import { useEffect } from "react";
import { useBasename, useRedirect } from "ra-core";

export function SingletonRedirect({ resource }: { resource: string }) {
  const redirect = useRedirect();
  const basename = useBasename();

  useEffect(() => {
    redirect(`${basename}/${resource}/${resource}`);
  }, [redirect, basename, resource]);

  return null;
}
