import { DataAdapters } from "authhero";

export type Bindings = {
  JWKS_URL: string;
  JWKS_SERVICE: {
    fetch: typeof fetch;
  };
  AUTH_URL: string;
  data: DataAdapters;
};
