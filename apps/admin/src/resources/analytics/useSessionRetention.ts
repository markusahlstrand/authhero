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

export interface SessionRetentionCohort {
  /** ISO date (UTC Monday) the cohort week starts on */
  cohort: string;
  /** Sessions created during the cohort week */
  sessions: number;
  /** active[k] = sessions still active k weeks after the cohort week */
  active: number[];
}

export interface SessionRetentionResponse {
  interval: "week";
  from: string;
  to: string;
  cohorts: SessionRetentionCohort[];
}

export function useSessionRetention(weeks: number) {
  const tenantId = useTenantId() ?? "";
  const [data, setData] = useState<SessionRetentionResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    // Drop the previous tenant's cohorts before fetching, so a failed or
    // slow request can never leave another tenant's data on screen.
    setData(null);
    setLoading(true);
    setError(null);

    const selectedDomain = getSelectedDomainFromStorage();
    const apiBase = resolveApiBase(selectedDomain).replace(/\/$/, "");
    const formatted = selectedDomain ? formatDomain(selectedDomain) : "";

    const url = `${apiBase}/api/v2/analytics/session-retention?weeks=${weeks}`;
    const httpClient = isSingleTenantForDomain(formatted)
      ? authorizedHttpClient
      : createOrganizationHttpClient(tenantId);

    httpClient(url, { headers: { "tenant-id": tenantId } as HeadersInit })
      .then((res: { body: string; json?: unknown }) => {
        if (cancelled) return;
        const json =
          (res as { json?: SessionRetentionResponse }).json ??
          (JSON.parse(res.body) as SessionRetentionResponse);
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
  }, [weeks, tenantId]);

  return { data, error, loading };
}
