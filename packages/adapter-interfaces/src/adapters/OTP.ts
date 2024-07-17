import { OTP } from "../types";

export interface OTPAdapter {
  create: (authCode: OTP) => Promise<void>;
  list: (tenant_id: string, email: string) => Promise<OTP[]>;
  remove: (tenant_id: string, id: string) => Promise<void>;
}
