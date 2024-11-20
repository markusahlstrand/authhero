export type Bindings = {
  JWKS_URL: string;
  JWKS_SERVICE: {
    fetch: typeof fetch;
  };
  AUTH_URL: string;
};
