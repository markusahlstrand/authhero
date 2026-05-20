import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordContext } from "ra-core";
import { Loader2, PlayCircle } from "lucide-react";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import { useTenantId } from "@/TenantContext";
import {
  buildUrlWithProtocol,
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Strategy } from "@/utils/Strategy";

interface ConnectionRecord {
  id: string;
  name: string;
  strategy: string;
}

type TryResult =
  | {
      mode: "inline";
      status: "success" | "error";
      connection_id: string;
      connection_name: string;
      strategy: string;
      userinfo?: Record<string, unknown>;
      raw?: Record<string, unknown> | null;
      error?: string;
      error_description?: string;
    }
  | {
      status: "success";
      connection_id: string;
      connection_name: string;
      strategy: string;
      userinfo: Record<string, unknown>;
      raw: Record<string, unknown> | null;
      completed_at: string;
    }
  | {
      status: "error";
      connection_id?: string;
      connection_name?: string;
      strategy?: string;
      error: string;
      error_description?: string;
      completed_at: string;
    };

function getApiBaseUrl(): string {
  const domains = getDomainFromStorage();
  const selectedDomain = getSelectedDomainFromStorage();
  const formattedSelectedDomain = formatDomain(selectedDomain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedSelectedDomain,
  );
  let apiUrl: string;
  if (domainConfig?.restApiUrl) {
    apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
  } else if (selectedDomain) {
    apiUrl = buildUrlWithProtocol(selectedDomain);
  } else {
    apiUrl = buildUrlWithProtocol(getConfigValue("apiUrl"));
  }
  return apiUrl.replace(/\/$/, "");
}

function getHttpClient(tenantId: string) {
  const formattedDomain = formatDomain(getSelectedDomainFromStorage());
  if (isSingleTenantForDomain(formattedDomain)) {
    return authorizedHttpClient;
  }
  return createOrganizationHttpClient(tenantId);
}

function ResultPanel({ result }: { result: TryResult }) {
  const isSuccess = result.status === "success";
  return (
    <div className="space-y-3">
      <div
        className={`rounded-md border p-3 text-sm ${
          isSuccess
            ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            : "border-red-400 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
        }`}
      >
        {isSuccess
          ? "It works! Connection returned a profile."
          : `Try connection failed: ${
              "error" in result ? result.error : "unknown error"
            }${
              "error_description" in result && result.error_description
                ? ` — ${result.error_description}`
                : ""
            }`}
      </div>
      {"userinfo" in result && result.userinfo && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Normalized profile
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(result.userinfo, null, 2)}
          </pre>
        </div>
      )}
      {"raw" in result && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Raw provider response
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            {result.raw
              ? JSON.stringify(result.raw, null, 2)
              : "(strategy does not expose raw upstream payload yet)"}
          </pre>
        </div>
      )}
    </div>
  );
}

export function TryTab() {
  const record = useRecordContext<ConnectionRecord>();
  const tenantId = useTenantId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const popupRef = useRef<Window | null>(null);

  const isDb = record?.strategy === Strategy.USERNAME_PASSWORD;

  const callTry = useCallback(
    async (body?: { username?: string; password?: string }) => {
      if (!record?.id || !tenantId) return null;
      const baseUrl = getApiBaseUrl();
      const httpClient = getHttpClient(tenantId);
      const response = await httpClient(
        `${baseUrl}/api/v2/connections/${encodeURIComponent(record.id)}/try`,
        {
          method: "POST",
          headers: { "tenant-id": tenantId },
          body: JSON.stringify(body ?? {}),
        },
      );
      return response.json as
        | {
            mode: "inline";
            status: "success" | "error";
            connection_id: string;
            connection_name: string;
            strategy: string;
            userinfo?: Record<string, unknown>;
            raw?: Record<string, unknown> | null;
            error?: string;
            error_description?: string;
          }
        | {
            mode: "redirect";
            authorize_url: string;
            state: string;
            result_url: string;
            client_id: string;
            connection: { id: string; name: string; strategy: string };
          };
    },
    [record?.id, tenantId],
  );

  const handleDbSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!username || !password) return;
      setBusy(true);
      setResult(null);
      try {
        const body = await callTry({ username, password });
        if (body && "mode" in body && body.mode === "inline") {
          setResult(body);
        }
      } catch (err) {
        setResult({
          status: "error",
          error: "request_failed",
          error_description: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        });
      } finally {
        setBusy(false);
      }
    },
    [callTry, username, password],
  );

  const handleBrowserStart = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const body = await callTry();
      if (body && "mode" in body && body.mode === "redirect") {
        popupRef.current = window.open(
          body.authorize_url,
          "authhero-try-connection",
          "width=520,height=720",
        );
      }
    } catch (err) {
      setResult({
        status: "error",
        error: "request_failed",
        error_description: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }, [callTry]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; result?: TryResult } | null;
      if (data && data.type === "authhero:try-connection" && data.result) {
        setResult(data.result);
        popupRef.current?.close();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!record) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="text-sm text-muted-foreground">
        Run this connection end-to-end against an internal test client.
        Successful logins are not persisted as users; errors surface the real
        cause for debugging.
      </div>

      {isDb ? (
        <form onSubmit={handleDbSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Username / Email</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Try connection
          </Button>
        </form>
      ) : (
        <Button onClick={handleBrowserStart} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="mr-2 h-4 w-4" />
          )}
          Try connection in popup
        </Button>
      )}

      {result && <ResultPanel result={result} />}
    </div>
  );
}
