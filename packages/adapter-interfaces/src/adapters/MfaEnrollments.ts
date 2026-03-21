import { MfaEnrollment, MfaEnrollmentInsert } from "../types/MfaEnrollment";

export interface MfaEnrollmentsAdapter {
  create: (
    tenant_id: string,
    enrollment: MfaEnrollmentInsert,
  ) => Promise<MfaEnrollment>;
  get: (
    tenant_id: string,
    enrollment_id: string,
  ) => Promise<MfaEnrollment | null>;
  list: (tenant_id: string, user_id: string) => Promise<MfaEnrollment[]>;
  update: (
    tenant_id: string,
    enrollment_id: string,
    data: Partial<MfaEnrollmentInsert>,
  ) => Promise<MfaEnrollment>;
  remove: (tenant_id: string, enrollment_id: string) => Promise<boolean>;
}
