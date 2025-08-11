import { ListParams } from "../types/ListParams";
import { Rule, RuleInsert, Totals } from "../types";

export interface ListRulesResponse extends Totals {
  rules: Rule[];
}

export interface RulesAdapter {
  create(tenant_id: string, rule: RuleInsert): Promise<Rule>;
  get(tenant_id: string, rule_id: string): Promise<Rule | null>;
  list(tenant_id: string, params?: ListParams): Promise<ListRulesResponse>;
  update(
    tenant_id: string,
    rule_id: string,
    rule: Partial<RuleInsert>,
  ): Promise<boolean>;
  remove(tenant_id: string, rule_id: string): Promise<boolean>;
}
