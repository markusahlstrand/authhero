import { useEffect } from "react";
import { useRedirect, useBasename } from "react-admin";

export function PromptsList() {
  const redirect = useRedirect();
  const basename = useBasename();

  useEffect(() => {
    // For singleton resources, redirect to edit with "prompts" as the ID
    redirect(`${basename}/prompts/prompts`);
  }, [redirect, basename]);

  return null;
}
