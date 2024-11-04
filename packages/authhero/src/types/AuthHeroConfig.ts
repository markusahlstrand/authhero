import { DataAdapters } from "@authhero/adapter-interfaces";

export interface AuthHeroConfig {
  dataAdapter: DataAdapters;
  issuer: string;
}
