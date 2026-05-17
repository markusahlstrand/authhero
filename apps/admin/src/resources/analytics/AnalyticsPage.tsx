import { useMemo, useState } from "react";
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
import { format, parseISO, subDays } from "date-fns";
import {
  AnalyticsGroupBy,
  AnalyticsInterval,
  AnalyticsResource,
  useAnalyticsQuery,
} from "./useAnalyticsQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

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
    value: "logins",
    label: "Logins",
    metric: "logins",
    dims: ["time", "connection", "client_id", "user_type", "event"],
  },
  {
    value: "signups",
    label: "Signups",
    metric: "signups",
    dims: ["time", "connection", "client_id", "user_type", "event"],
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
];

const PRESETS: Array<{ label: string; days: number; interval: AnalyticsInterval }> = [
  { label: "Last 24h", days: 1, interval: "hour" },
  { label: "Last 7d", days: 7, interval: "day" },
  { label: "Last 30d", days: 30, interval: "day" },
  { label: "Last 90d", days: 90, interval: "day" },
];

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
  const [preset, setPreset] = useState(PRESETS[1]);
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy[]>(["time"]);

  const resourceMeta = RESOURCES.find((r) => r.value === resource)!;
  const now = useMemo(() => new Date(), []);
  const from = useMemo(
    () => subDays(now, preset.days).toISOString(),
    [now, preset],
  );
  const to = useMemo(() => now.toISOString(), [now]);

  const { data, loading, error } = useAnalyticsQuery(resource, {
    from,
    to,
    interval: preset.interval,
    groupBy,
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
          Time-series metrics for users, logins, signups, sessions, and tokens.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
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

          <div className="flex items-center gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={p.label === preset.label ? "default" : "outline"}
                onClick={() => setPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>

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
                    tickFormatter={(v) => {
                      try {
                        return format(parseISO(String(v)), "MMM d");
                      } catch {
                        return String(v);
                      }
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Bar
                    dataKey={seriesKeys[0]}
                    fill={CHART_COLORS[0]}
                  />
                </BarChart>
              ) : (
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => {
                      try {
                        return format(parseISO(String(v)), "MMM d");
                      } catch {
                        return String(v);
                      }
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
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
