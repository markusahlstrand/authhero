import { useMemo, useState } from "react";
import { useNotify, useRecordContext } from "ra-core";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTenantId } from "@/TenantContext";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "@/authProvider";
import {
  buildUrlWithProtocol,
  formatDomain,
  getDomainFromStorage,
  getSelectedDomainFromStorage,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";

const EXAMPLE_EVENTS: Record<string, Record<string, unknown>> = {
  "post-login": {
    user: {
      user_id: "auth0|example",
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
    },
    client: { client_id: "test-client", name: "Test Client" },
    connection: {
      id: "con_test",
      name: "Username-Password-Authentication",
      strategy: "auth0",
    },
    request: {
      ip: "127.0.0.1",
      method: "GET",
      url: "https://example.com/authorize",
    },
    transaction: { redirect_uri: "https://example.com/callback" },
    tenant: { id: "test-tenant" },
    stats: { logins_count: 1 },
  },
  "credentials-exchange": {
    user: { user_id: "auth0|example", email: "test@example.com" },
    client: { client_id: "test-client", name: "Test Client" },
    scope: "openid profile email",
    grant_type: "authorization_code",
    request: { ip: "127.0.0.1", method: "POST", url: "/oauth/token" },
  },
  "pre-user-registration": {
    user: {
      email: "newuser@example.com",
      tenant: "test-tenant",
      username: "newuser",
      app_metadata: {},
      user_metadata: {},
    },
    request: { ip: "127.0.0.1", method: "POST", url: "/dbconnections/signup" },
  },
  "post-user-registration": {
    user: {
      user_id: "auth0|newuser",
      email: "newuser@example.com",
      email_verified: false,
    },
    request: { ip: "127.0.0.1", method: "POST", url: "/dbconnections/signup" },
  },
};

function getApiUrl(): string {
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

type TestResult = {
  success: boolean;
  error?: string;
  duration_ms: number;
  api_calls: Array<{ method: string; args: unknown[] }>;
  logs: Array<{ level: string; message: string }>;
};

function isTestResult(value: unknown): value is TestResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.success === "boolean" &&
    typeof v.duration_ms === "number" &&
    Array.isArray(v.api_calls) &&
    Array.isArray(v.logs)
  );
}

type ActionRecord = {
  id?: string;
  supported_triggers?: Array<{ id?: string }>;
};

export function TestTab() {
  const record = useRecordContext<ActionRecord>();
  const tenantId = useTenantId() ?? "";
  const notify = useNotify();

  const initialTrigger = useMemo(
    () => record?.supported_triggers?.[0]?.id ?? "post-login",
    [record],
  );

  const [trigger, setTrigger] = useState(initialTrigger);
  const [payload, setPayload] = useState(() =>
    JSON.stringify(EXAMPLE_EVENTS[initialTrigger] ?? {}, null, 2),
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTriggerChange = (next: string) => {
    setTrigger(next);
    setPayload(JSON.stringify(EXAMPLE_EVENTS[next] ?? {}, null, 2));
  };

  const handleRun = async () => {
    if (!record?.id) return;
    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(payload);
    } catch (err) {
      notify(`Invalid JSON: ${(err as Error).message}`, { type: "error" });
      return;
    }

    setRunning(true);
    setResult(null);
    try {
      const apiUrl = getApiUrl();
      const httpClient = getHttpClient(tenantId);
      const response = await httpClient(
        `${apiUrl}/api/v2/actions/actions/${record.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({ trigger_id: trigger, event: parsedEvent }),
          headers: new Headers({
            "tenant-id": tenantId,
            "content-type": "application/json",
          }),
        },
      );
      const json =
        response && typeof response === "object" && "json" in response
          ? (response as { json: unknown }).json
          : undefined;
      if (isTestResult(json)) {
        setResult(json);
      } else {
        notify("Unexpected response from test endpoint", { type: "error" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Test run failed: ${message}`, { type: "error" });
    } finally {
      setRunning(false);
    }
  };

  if (!record?.id) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the action before testing it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Run a test</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="test-trigger">Trigger</Label>
            <Select value={trigger} onValueChange={handleTriggerChange}>
              <SelectTrigger id="test-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(EXAMPLE_EVENTS).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="test-payload">Event payload (JSON)</Label>
            <Textarea
              id="test-payload"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={18}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Button type="button" onClick={handleRun} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span
                className={
                  result.success ? "text-green-600" : "text-destructive"
                }
              >
                {result.success ? "Success" : "Failed"}
              </span>{" "}
              <span className="text-sm font-normal text-muted-foreground">
                in {result.duration_ms} ms
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.error && (
              <pre className="rounded-md bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap">
                {result.error}
              </pre>
            )}
            {result.api_calls.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">API calls</h4>
                <pre className="rounded-md bg-muted p-2 text-xs overflow-auto max-h-60">
                  {result.api_calls
                    .map(
                      (c) =>
                        `${c.method}(${c.args
                          .map((a) => JSON.stringify(a))
                          .join(", ")})`,
                    )
                    .join("\n")}
                </pre>
              </div>
            )}
            {result.logs.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-1">Console output</h4>
                <pre className="rounded-md bg-muted p-2 text-xs overflow-auto max-h-60">
                  {result.logs
                    .map((l) => `[${l.level}] ${l.message}`)
                    .join("\n")}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
