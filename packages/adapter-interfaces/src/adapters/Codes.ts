import { ListParams } from "src/types/ListParams";
import { Code, CodeType, Totals } from "../types";

export interface ListCodesResponse extends Totals {
  codes: Code[];
}

export interface CodesAdapter {
  create: (tenant_id: string, authCode: Code) => Promise<Code>;
  get: (
    tenant_id: string,
    code_id: string,
    type: CodeType,
  ) => Promise<Code | null>;
  list: (tenant_id: string, params: ListParams) => Promise<ListCodesResponse>;
  remove: (tenant_id: string, code: string) => Promise<boolean>;
}
