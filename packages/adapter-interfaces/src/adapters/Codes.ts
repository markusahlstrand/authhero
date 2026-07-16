import { ListParams } from "../types/ListParams";
import { Code, CodeInsert, CodeType, Totals } from "../types";

export interface ListCodesResponse extends Totals {
  codes: Code[];
}

export interface CodesAdapter {
  create: (tenant_id: string, code: CodeInsert) => Promise<Code>;
  get: (
    tenant_id: string,
    code_id: string,
    type: CodeType,
  ) => Promise<Code | null>;
  list: (tenant_id: string, params?: ListParams) => Promise<ListCodesResponse>;
  used: (tenant_id: string, code_id: string) => Promise<boolean>;
  /**
   * Atomically mark a code as used only if it has not been used yet.
   * Returns true if the code was successfully consumed (was unused), false otherwise.
   */
  consume: (tenant_id: string, code_id: string) => Promise<boolean>;
  remove: (tenant_id: string, code_id: string) => Promise<boolean>;
  /**
   * Delete codes that expired before the given ISO date. Returns count deleted.
   *
   * Codes are short-lived by design, so nothing reads a row once it is past
   * `expires_at` — this is a pure retention sweep, and unlike `remove` it is
   * not tenant-scoped. Intended to be driven by `cleanupCodes` from a
   * scheduled handler.
   */
  cleanup: (olderThan: string) => Promise<number>;
}
