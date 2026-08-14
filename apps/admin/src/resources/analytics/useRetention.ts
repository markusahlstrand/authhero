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

export type RetentionSource = "sessions" | "refresh-tokens";

export interface RetentionCohort {
  /** ISO date (UTC Monday) the cohort week starts on */
  cohort: string;
  /** Sessions or refresh-token families created during the cohort week */
  total: number;
  /** active[k] = units still active k weeks after the cohort week */
  active: number[];
}

export interface RetentionResponse {
  interval: "week";
  from: string;
  to: string;
  cohorts: RetentionCohort[];
}

// The two endpoints share a shape except for the per-cohort total's name.
interface WireCohort {
  cohort: string;
  sessions?: number;
  tokens?: number;
  active: number[];
}

interface WireResponse {
  interval: "week";
  from: string;
  to: string;
  cohorts: WireCohort[];
}

export function useRetention(
  source: RetentionSource,
  weeks: number,
  clientIds: string[],
) {
  const tenantId = useTenantId() ?? "";
  const [data, setData] = useState<RetentionResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  // Effect deps need a stable primitive, and the query string is what the
  // request actually varies on.
  const clientQuery = clientIds
    .map((c) => `&client_id=${encodeURIComponent(c)}`)
    .join("");

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

    const endpoint =
      source === "sessions" ? "session-retention" : "refresh-token-retention";
    const url = `${apiBase}/api/v2/analytics/${endpoint}?weeks=${weeks}${
      source === "refresh-tokens" ? clientQuery : ""
    }`;
    const httpClient = isSingleTenantForDomain(formatted)
      ? authorizedHttpClient
      : createOrganizationHttpClient(tenantId);

    httpClient(url, { headers: { "tenant-id": tenantId } as HeadersInit })
      .then((res: { body: string; json?: unknown }) => {
        if (cancelled) return;
        const json =
          (res.json as WireResponse | undefined) ??
          (JSON.parse(res.body) as WireResponse);
        setData({
          ...json,
          cohorts: json.cohorts.map((c) => ({
            cohort: c.cohort,
            total: c.sessions ?? c.tokens ?? 0,
            active: c.active,
          })),
        });
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
  }, [source, weeks, clientQuery, tenantId]);

  return { data, error, loading };
}
