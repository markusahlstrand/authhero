import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AnalyticsGroupBy,
  AnalyticsResource,
  useAnalyticsQuery,
} from "./useAnalyticsQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { presetRange, TimeRange, TimeRangePicker } from "./TimeRangePicker";
import {
  formatBucket,
  IntervalSetting,
  MAX_HOURLY_RANGE_DAYS,
  rangeDays,
  resolveInterval,
} from "./analyticsTime";

// Ordered alphabetically by label — this drives the resource dropdown.
const RESOURCES: Array<{
  value: AnalyticsResource;
  label: string;
  metric: string;
  dims: AnalyticsGroupBy[];
}> = [
  {
    value: "active-users",
    label: "Active Users",
    metric: "active_users",
    dims: ["time", "connection", "client_id", "user_type"],
  },
  {
    value: "codes-sent",
    label: "Codes Sent",
    metric: "codes_sent",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "email-verifications",
    label: "Email Verifications",
    metric: "email_verifications",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "logins",
    label: "Logins",
    metric: "logins",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "logouts",
    label: "Logouts",
    metric: "logouts",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "mfa",
    label: "MFA",
    metric: "mfa",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "password-changes",
    label: "Password Changes",
    metric: "password_changes",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "password-migrations",
    label: "Password Migrations",
    metric: "password_migrations",
    dims: ["time", "connection", "client_id", "user_type"],
  },
  {
    value: "refresh-tokens",
    label: "Refresh Tokens",
    metric: "refresh_tokens",
    dims: ["time", "client_id", "event"],
  },
  {
    value: "sessions",
    label: "Sessions",
    metric: "sessions",
    dims: ["time", "client_id"],
  },
  {
    value: "signups",
    label: "Signups",
    metric: "signups",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
];

const INTERVAL_OPTIONS: Array<{ value: IntervalSetting; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

// Backend filters are validated against this enum; "all" means no filter.
const USER_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All user types" },
  { value: "password", label: "Password" },
  { value: "social", label: "Social" },
  { value: "passwordless", label: "Passwordless" },
  { value: "enterprise", label: "Enterprise" },
];

// Debounce free-text filters so we issue one query after typing settles rather
// than one per keystroke.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// Split a comma-separated filter input into the repeatable array the API takes.
function toFilterList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const CHART_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0284c7",
  "#a16207",
];

function pivotForTimeSeries(
  rows: Array<Record<string, unknown>>,
  metric: string,
  dimColumns: string[],
): { rows: Array<Record<string, unknown>>; seriesKeys: string[] } {
  const timeKey = "time";
  const groupKeys = dimColumns.filter((c) => c !== timeKey);
  if (groupKeys.length === 0) {
    return {
      rows: rows.map((r) => ({
        time: r.time,
        [metric]: r[metric],
      })),
      seriesKeys: [metric],
    };
  }

  const map = new Map<string, Record<string, unknown>>();
  const seriesSet = new Set<string>();
  for (const r of rows) {
    const time = String(r.time);
    const seriesParts = groupKeys.map((k) => String(r[k] ?? ""));
    const seriesKey = seriesParts.join(" / ") || metric;
    seriesSet.add(seriesKey);
    if (!map.has(time)) map.set(time, { time });
    const point = map.get(time)!;
    point[seriesKey] = r[metric];
  }
  return {
    rows: Array.from(map.values()).sort((a, b) =>
      String(a.time).localeCompare(String(b.time)),
    ),
    seriesKeys: Array.from(seriesSet),
  };
}

export function AnalyticsPage() {
  const [resource, setResource] = useState<AnalyticsResource>("logins");
  const [range, setRange] = useState<TimeRange>(() => presetRange(7));
  const [interval, setInterval] = useState<IntervalSetting>("auto");
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy[]>(["time"]);
  const [clientId, setClientId] = useState("");
  const [connection, setConnection] = useState("");
  const [userId, setUserId] = useState("");
  const [userType, setUserType] = useState("all");

  const debouncedClientId = useDebounced(clientId, 400);
  const debouncedConnection = useDebounced(connection, 400);
  const debouncedUserId = useDebounced(userId, 400);

  const hasFilters =
    clientId !== "" || connection !== "" || userId !== "" || userType !== "all";

  const clearFilters = () => {
    setClientId("");
    setConnection("");
    setUserId("");
    setUserType("all");
  };

  const resourceMeta = RESOURCES.find((r) => r.value === resource)!;

  const effectiveInterval = useMemo(
    () => resolveInterval(interval, range.from, range.to),
    [interval, range],
  );
  // The backend rejects the hour bucket for ranges longer than 30 days.
  const hourDisabled = rangeDays(range.from, range.to) > MAX_HOURLY_RANGE_DAYS;

  const from = useMemo(() => range.from.toISOString(), [range]);
  const to = useMemo(() => range.to.toISOString(), [range]);

  const { data, loading, error } = useAnalyticsQuery(resource, {
    from,
    to,
    interval: effectiveInterval,
    groupBy,
    clientId: toFilterList(debouncedClientId),
    connection: toFilterList(debouncedConnection),
    userId: toFilterList(debouncedUserId),
    userType: userType === "all" ? [] : [userType],
  });

  const dimColumns = useMemo(() => groupBy.map((g) => String(g)), [groupBy]);

  const { rows, seriesKeys } = useMemo(() => {
    const all = data?.data ?? [];
    return pivotForTimeSeries(all, resourceMeta.metric, dimColumns);
  }, [data, resourceMeta.metric, dimColumns]);

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Time-series metrics for users, logins, signups, sessions, tokens, and
          more — filter by client, connection, user, or user type.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={resource}
              onValueChange={(v) => {
                setResource(v as AnalyticsResource);
                setGroupBy(["time"]);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TimeRangePicker value={range} onChange={setRange} />

            <Select
              value={interval}
              onValueChange={(v) => setInterval(v as IntervalSetting)}
            >
              <SelectTrigger className="w-36">
                <SelectValue>
                  {interval === "auto"
                    ? `Auto (${effectiveInterval})`
                    : INTERVAL_OPTIONS.find((o) => o.value === interval)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    disabled={o.value === "hour" && hourDisabled}
                  >
                    {o.value === "auto"
                      ? `Auto (${effectiveInterval})`
                      : o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              {resourceMeta.dims
                .filter((d) => d !== "time")
                .map((d) => {
                  const active = groupBy.includes(d);
                  return (
                    <Button
                      key={d}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() =>
                        setGroupBy((prev) =>
                          active ? prev.filter((p) => p !== d) : [...prev, d],
                        )
                      }
                    >
                      {d}
                    </Button>
                  );
                })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="analytics-filter-client-id"
                className="text-xs text-muted-foreground"
              >
                Client ID
              </Label>
              <Input
                id="analytics-filter-client-id"
                className="w-44"
                placeholder="Filter by client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="analytics-filter-connection"
                className="text-xs text-muted-foreground"
              >
                Connection
              </Label>
              <Input
                id="analytics-filter-connection"
                className="w-44"
                placeholder="Filter by connection"
                value={connection}
                onChange={(e) => setConnection(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="analytics-filter-user-id"
                className="text-xs text-muted-foreground"
              >
                User ID
              </Label>
              <Input
                id="analytics-filter-user-id"
                className="w-44"
                placeholder="Filter by user ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="analytics-filter-user-type"
                className="text-xs text-muted-foreground"
              >
                User type
              </Label>
              <Select value={userType} onValueChange={setUserType}>
                <SelectTrigger id="analytics-filter-user-type" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{resourceMeta.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-72">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              {seriesKeys.length === 1 ? (
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatBucket(v, effectiveInterval)}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(v) => formatBucket(v, effectiveInterval)}
                  />
                  <Bar dataKey={seriesKeys[0]} fill={CHART_COLORS[0]} />
                </BarChart>
              ) : (
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatBucket(v, effectiveInterval)}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    labelFormatter={(v) => formatBucket(v, effectiveInterval)}
                  />
                  <Legend />
                  {seriesKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
