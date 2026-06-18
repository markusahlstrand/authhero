// Shared external link targets for the marketing site.
export const DOCS_URL = "https://docs.authhero.net";
export const GITHUB_URL = "https://github.com/markusahlstrand/authhero";
// The AuthHero GitHub organization (all open-source repos).
export const GITHUB_ORG_URL = "https://github.com/authhero";

// Build a docs.authhero.net URL. VitePress runs with cleanUrls, so paths have
// no extension (e.g. docs("/features/impersonation")).
export const docs = (path = "") => `${DOCS_URL}${path}`;
