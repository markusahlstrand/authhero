import { DataAdapters } from "@authhero/adapter-interfaces";

export type Bindings = {
  ISSUER: string;
  ENVIRONMENT: string;
  AUTH_URL: string;

  data: DataAdapters;

  // Constants
  JWKS_CACHE_TIMEOUT_IN_SECONDS: number;
};
