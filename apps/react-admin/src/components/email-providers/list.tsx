import { EmailProvidersEdit } from "./edit";

// Singleton resource — render the edit form at the list URL
// so the path stays /email-providers instead of /email-providers/email-providers.
export function EmailProvidersList() {
  return <EmailProvidersEdit id="email-providers" />;
}
