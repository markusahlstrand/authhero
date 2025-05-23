import { Form, FormInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListFormsResponse extends Totals {
  forms: Form[];
}

export interface FormsAdapter {
  create(tenant_id: string, params: FormInsert): Promise<Form>;
  get(tenant_id: string, form_id: string): Promise<Form | null>;
  remove(tenant_id: string, form_id: string): Promise<boolean>;
  update(
    tenant_id: string,
    form_id: string,
    form: Partial<FormInsert>,
  ): Promise<boolean>;
  list(tenant_id: string, params?: ListParams): Promise<ListFormsResponse>;
}
