// Deprecated: This file will be removed in the next version
import { AuthParams } from "./AuthParams";

export interface LoginState {
  connection?: string;
  authParams: AuthParams;
  state: string;
  errorMessage?: string;
}
