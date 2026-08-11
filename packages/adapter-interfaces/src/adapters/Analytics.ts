import {
  AnalyticsQueryParams,
  AnalyticsQueryResponse,
  AnalyticsResource,
  SessionRetentionParams,
  SessionRetentionResponse,
} from "../types/Analytics";

export interface AnalyticsAdapter {
  /**
   * Run an analytics query for a tenant. The adapter is responsible for
   * injecting the tenant_id predicate; the route handler never trusts a
   * tenant value from a client-controlled source.
   */
  query(
    tenantId: string,
    resource: AnalyticsResource,
    params: AnalyticsQueryParams,
  ): Promise<AnalyticsQueryResponse>;

  /**
   * Weekly session cohort retention, computed from the sessions table
   * (created_at_ts × used_at_ts) rather than logs. Optional: adapters that
   * only see log events (e.g. Analytics Engine) cannot implement it, and the
   * route responds 501 when it is absent.
   */
  sessionRetention?(
    tenantId: string,
    params: SessionRetentionParams,
  ): Promise<SessionRetentionResponse>;
}
