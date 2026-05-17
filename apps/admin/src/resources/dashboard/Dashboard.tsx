import { useEffect, useState } from "react";
import { useDataProvider } from "ra-core";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DailyStats {
  date: string;
  logins: number;
  signups: number;
  leaked_passwords: number;
}

interface ChartDatum {
  date: string;
  value: number;
}

interface StatsCardProps {
  title: string;
  value: number | string;
  loading?: boolean;
}

function StatsCard({ title, value, loading }: StatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="text-3xl font-semibold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  data: ChartDatum[];
  loading?: boolean;
  color?: string;
}

function ChartCard({ title, data, loading, color = "#2563eb" }: ChartCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-2xl font-semibold">
            {total.toLocaleString()}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!loading && data.length > 0 && (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  try {
                    return format(parseISO(v), "MMM d");
                  } catch {
                    return v;
                  }
                }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip
                labelFormatter={(v) => {
                  try {
                    return format(parseISO(v as string), "MMM d, yyyy");
                  } catch {
                    return String(v);
                  }
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const dataProvider = useDataProvider();
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [counts, setCounts] = useState<{
    users?: number;
    clients?: number;
    connections?: number;
  }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const to = new Date();
        const from = subDays(to, 30);
        const statsRes = await dataProvider.getList("stats/daily", {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "date", order: "ASC" },
          filter: {
            date_from: from.toISOString().slice(0, 10),
            date_to: to.toISOString().slice(0, 10),
          },
        });
        if (cancelled) return;
        setStats((statsRes.data as DailyStats[]) || []);

        const [usersRes, clientsRes, connectionsRes] = await Promise.allSettled(
          [
            dataProvider.getList("users", {
              pagination: { page: 1, perPage: 1 },
              sort: { field: "user_id", order: "DESC" },
              filter: {},
            }),
            dataProvider.getList("clients", {
              pagination: { page: 1, perPage: 1 },
              sort: { field: "id", order: "ASC" },
              filter: {},
            }),
            dataProvider.getList("connections", {
              pagination: { page: 1, perPage: 1 },
              sort: { field: "id", order: "ASC" },
              filter: {},
            }),
          ],
        );
        if (cancelled) return;
        setCounts({
          users:
            usersRes.status === "fulfilled" ? usersRes.value.total : undefined,
          clients:
            clientsRes.status === "fulfilled"
              ? clientsRes.value.total
              : undefined,
          connections:
            connectionsRes.status === "fulfilled"
              ? connectionsRes.value.total
              : undefined,
        });
      } catch (err) {
        console.error("Dashboard load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dataProvider]);

  const loginsData = stats.map((s) => ({ date: s.date, value: s.logins ?? 0 }));
  const signupsData = stats.map((s) => ({
    date: s.date,
    value: s.signups ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4 py-4">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard title="Users" value={counts.users ?? 0} loading={loading} />
        <StatsCard
          title="Applications"
          value={counts.clients ?? 0}
          loading={loading}
        />
        <StatsCard
          title="Connections"
          value={counts.connections ?? 0}
          loading={loading}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Daily logins (last 30 days)"
          data={loginsData}
          loading={loading}
        />
        <ChartCard
          title="Daily signups (last 30 days)"
          data={signupsData}
          loading={loading}
          color="#16a34a"
        />
      </div>
    </div>
  );
}
