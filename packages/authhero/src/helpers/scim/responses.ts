import { ContentfulStatusCode } from "hono/utils/http-status";

export const SCIM_ERROR_URN = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_LIST_URN =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_PATCH_OP_URN =
  "urn:ietf:params:scim:api:messages:2.0:PatchOp";
export const SCIM_CONTENT_TYPE = "application/scim+json";

export interface ScimErrorBody {
  schemas: string[];
  detail: string;
  status: string;
  scimType?: string;
}

/**
 * SCIM error object (RFC 7644 §3.12). `status` is a string, and `scimType` is
 * only meaningful for 400s (e.g. `uniqueness`, `invalidFilter`).
 */
export function scimErrorBody(
  status: number,
  detail: string,
  scimType?: string,
): ScimErrorBody {
  return {
    schemas: [SCIM_ERROR_URN],
    detail,
    status: String(status),
    ...(scimType ? { scimType } : {}),
  };
}

/**
 * Thrown from SCIM middleware/helpers; rendered by the SCIM app's `onError`
 * into a proper SCIM error object with the SCIM content type.
 */
export class ScimError extends Error {
  status: ContentfulStatusCode;
  scimType?: string;
  constructor(
    status: ContentfulStatusCode,
    detail: string,
    scimType?: string,
  ) {
    super(detail);
    this.name = "ScimError";
    this.status = status;
    this.scimType = scimType;
  }
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

/**
 * SCIM ListResponse envelope (RFC 7644 §3.4.2). `startIndex` is 1-based.
 */
export function scimListResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
  itemsPerPage: number,
): ScimListResponse<T> {
  return {
    schemas: [SCIM_LIST_URN],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}
