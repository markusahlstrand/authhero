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
  remove: (tenant_id: string, code_id: string) => Promise<boolean>;
}
