import { useEffect, useState } from "react";
import { useTenantId } from "@/TenantContext";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import { resolveApiBase } from "@/dataProvider";
import {
  formatDomain,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";

export type AnalyticsResource =
  | "active-users"
  | "logins"
  | "signups"
  | "refresh-tokens"
  | "sessions"
  | "logouts"
  | "password-changes"
  | "password-migrations"
  | "mfa"
  | "email-verifications"
  | "codes-sent";

export type AnalyticsInterval = "hour" | "day" | "week" | "month";

export type AnalyticsGroupBy =
  | "time"
  | "connection"
  | "client_id"
  | "user_type"
  | "event";

export interface AnalyticsQueryArgs {
  from?: string; // ISO
  to?: string; // ISO
  interval?: AnalyticsInterval;
  tz?: string;
  groupBy?: AnalyticsGroupBy[];
  connection?: string[];
  clientId?: string[];
  userType?: string[];
  userId?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface AnalyticsResponse {
  meta: Array<{ name: string; type: string }>;
  data: Array<Record<string, unknown>>;
  rows: number;
  rows_before_limit_at_least?: number;
}

function buildQueryString(args: AnalyticsQueryArgs): string {
  const params = new URLSearchParams();
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.interval) params.set("interval", args.interval);
  if (args.tz) params.set("tz", args.tz);
  if (args.groupBy?.length) params.set("group_by", args.groupBy.join(","));
  for (const v of args.connection || []) params.append("connection", v);
  for (const v of args.clientId || []) params.append("client_id", v);
  for (const v of args.userType || []) params.append("user_type", v);
  for (const v of args.userId || []) params.append("user_id", v);
  if (args.limit !== undefined) params.set("limit", String(args.limit));
  if (args.offset !== undefined) params.set("offset", String(args.offset));
  if (args.orderBy) params.set("order_by", args.orderBy);
  return params.toString();
}

export function useAnalyticsQuery(
  resource: AnalyticsResource,
  args: AnalyticsQueryArgs,
) {
  const tenantId = useTenantId() ?? "";
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const queryString = buildQueryString(args);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const selectedDomain = getSelectedDomainFromStorage();
    const apiBase = resolveApiBase(selectedDomain).replace(/\/$/, "");
    const formatted = selectedDomain ? formatDomain(selectedDomain) : "";

    const url = `${apiBase}/api/v2/analytics/${resource}?${queryString}`;
    const httpClient = isSingleTenantForDomain(formatted)
      ? authorizedHttpClient
      : createOrganizationHttpClient(tenantId);

    httpClient(url, { headers: { "tenant-id": tenantId } as HeadersInit })
      .then((res: { body: string; json?: unknown }) => {
        if (cancelled) return;
        // react-admin fetchUtils.fetchJson returns { json, body, status, headers }
        const json =
          (res as { json?: AnalyticsResponse }).json ??
          (JSON.parse(res.body) as AnalyticsResponse);
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resource, queryString, tenantId]);

  return { data, error, loading };
}
