// Deprecated: This file will be removed in the next version
import { OTP, OTPInsert } from "../types";

export interface OTPAdapter {
  create: (tenant_id: string, authCode: OTPInsert) => Promise<void>;
  list: (tenant_id: string, email: string) => Promise<OTP[]>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
