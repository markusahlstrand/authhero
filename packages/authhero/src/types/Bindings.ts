import { DataAdapters } from "@authhero/adapter-interfaces";

declare type Fetcher = {
  fetch: typeof fetch;
};

export type Bindings = {
  ENVIRONMENT: string;
  AUTH_URL: string;
  JWKS_URL: string;
  JWKS_SERVICE: Fetcher;

  data: DataAdapters;

  // Constants
  JWKS_CACHE_TIMEOUT_IN_SECONDS: number;
  // This is used as CN in the certificate
  ORGANIZATION_NAME: string;
};
