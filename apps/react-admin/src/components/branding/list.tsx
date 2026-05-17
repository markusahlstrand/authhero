import { BrandingEdit } from "./edit";

// Branding is a singleton resource — render the edit form at the list URL
// so the path stays /branding instead of /branding/branding.
export function BrandingList() {
  return <BrandingEdit id="branding" />;
}
