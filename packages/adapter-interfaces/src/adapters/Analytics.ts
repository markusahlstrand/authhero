import {
  AnalyticsQueryParams,
  AnalyticsQueryResponse,
  AnalyticsResource,
  RefreshTokenRetentionParams,
  RefreshTokenRetentionResponse,
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

  /**
   * Weekly refresh-token cohort retention, computed from the refresh_tokens
   * table. Rotating tokens mint a new row per exchange, so rows are grouped
   * into rotation families before folding: a family's cohort week comes from
   * its first token's created_at_ts and its last-active week from the max of
   * last_exchanged_at_ts/created_at_ts across the family. Optional for the
   * same reason as sessionRetention.
   */
  refreshTokenRetention?(
    tenantId: string,
    params: RefreshTokenRetentionParams,
  ): Promise<RefreshTokenRetentionResponse>;
}
