import { isCimdClient } from "./cimd";

type ClientLike = {
  app_type?: string;
  client_metadata?: Record<string, unknown> | null;
};

export type ClientShape = {
  // Whether the client authenticates with a secret (vs. PKCE/public).
  showSecret: boolean;
  // Whether the client makes user-agent (browser/native) redirects.
  showCallbacks: boolean;
  // Whether the client is externally managed (CIMD / DCR) and locally edited
  // fields will be overwritten.
  isExternallyManaged: boolean;
};

// Mirrors Auth0's app-type model: SPA and Native are public (no secret, no
// confidential grants); Machine-to-Machine has no user agent so no callbacks
// apply; Regular Web is the conventional confidential interactive client.
export function getClientShape(record: ClientLike | undefined): ClientShape {
  if (isCimdClient(record)) {
    return {
      showSecret: false,
      showCallbacks: true,
      isExternallyManaged: true,
    };
  }
  switch (record?.app_type) {
    case "spa":
    case "native":
      return {
        showSecret: false,
        showCallbacks: true,
        isExternallyManaged: false,
      };
    case "non_interactive":
      return {
        showSecret: true,
        showCallbacks: false,
        isExternallyManaged: false,
      };
    default:
      return {
        showSecret: true,
        showCallbacks: true,
        isExternallyManaged: false,
      };
  }
}
