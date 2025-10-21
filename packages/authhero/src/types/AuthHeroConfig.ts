import { DataAdapters } from "@authhero/adapter-interfaces";
import type { SamlSigner } from "@authhero/saml/core";
import {
  OnExecuteCredentialsExchange,
  OnExecutePreUserRegistration,
  OnExecutePostUserRegistration,
  OnExecutePreUserUpdate,
  OnExecutePostLogin,
} from "./Hooks";

export interface AuthHeroConfig {
  dataAdapter: DataAdapters;
  allowedOrigins?: string[];
  samlSigner?: SamlSigner;
  hooks?: {
    onExecuteCredentialsExchange?: OnExecuteCredentialsExchange;
    onExecutePreUserRegistration?: OnExecutePreUserRegistration;
    onExecutePostUserRegistration?: OnExecutePostUserRegistration;
    onExecutePreUserUpdate?: OnExecutePreUserUpdate;
    onExecutePostLogin?: OnExecutePostLogin;
  };
}
