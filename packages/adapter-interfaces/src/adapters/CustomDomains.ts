import {
  CustomDomain,
  CustomDomainCertificateUpload,
  CustomDomainInsert,
  CustomDomainWithTenantId,
} from "../types/CustomDomain";

export interface CustomDomainsAdapter {
  create: (
    tenant_id: string,
    custom_domain: CustomDomainInsert,
  ) => Promise<CustomDomain>;
  get: (tenant_id: string, id: string) => Promise<CustomDomain | null>;
  // This is used to determine with tenant a request belongs to
  getByDomain: (domain: string) => Promise<CustomDomainWithTenantId | null>;
  list: (tenant_id: string) => Promise<CustomDomain[]>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  update: (
    tenant_id: string,
    id: string,
    custom_domain: Partial<CustomDomain>,
  ) => Promise<boolean>;
  // Optional. Implemented by adapters whose edge can terminate TLS with a
  // customer-supplied certificate (e.g. Cloudflare Custom Hostnames BYOC).
  // The certificate and key are forwarded to the edge and never persisted
  // by authhero.
  uploadCertificate?: (
    tenant_id: string,
    id: string,
    cert: CustomDomainCertificateUpload,
  ) => Promise<CustomDomain>;
}
