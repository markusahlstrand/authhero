import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useDataProvider, useBasename } from "react-admin";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";

interface DailyStats {
  date: string;
  logins: number;
  signups: number;
  leaked_passwords: number;
  updated_at: string;
  created_at: string;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  loading?: boolean;
}

function StatsCard({ title, value, loading }: StatsCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography color="textSecondary" gutterBottom variant="body2">
          {title}
        </Typography>
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          <Typography variant="h4" component="div">
            {typeof value === "number" ? value.toLocaleString() : value}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  data: Array<{ date: string; value: number }>;
  loading?: boolean;
  color?: string;
  showViewLogs?: boolean;
  logsFilter?: string;
}

function ChartCard({
  title,
  data,
  loading,
  color = "#1976d2",
  showViewLogs,
  logsFilter,
}: ChartCardProps) {
  const navigate = useNavigate();
  const basename = useBasename();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const handleViewLogs = () => {
    if (logsFilter) {
      navigate(`${basename}/logs?filter=${encodeURIComponent(logsFilter)}`);
    } else {
      navigate(`${basename}/logs`);
    }
  };

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 1,
        }}
      >
        <Box>
          <Typography variant="subtitle1" color="textSecondary">
            {title}
          </Typography>
          {loading ? (
            <CircularProgress size={20} />
          ) : (
            <Typography variant="h5" sx={{ fontWeight: "bold" }}>
              {total.toLocaleString()}
            </Typography>
          )}
        </Box>
        {showViewLogs && (
          <Button size="small" onClick={handleViewLogs}>
            View logs
          </Button>
        )}
      </Box>
      {!loading && data.length > 0 && (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => {
                try {
                  return format(parseISO(value), "MMM d");
                } catch {
                  return value;
                }
              }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              labelFormatter={(value) => {
                try {
                  return format(parseISO(value as string), "MMM d, yyyy");
                } catch {
                  return value;
                }
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      {!loading && data.length === 0 && (
        <Box
          sx={{
            height: 150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography color="textSecondary">No data available</Typography>
        </Box>
      )}
    </Paper>
  );
}

export function ActivityDashboard() {
  const dataProvider = useDataProvider();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [totalClients, setTotalClients] = useState<number>(0);
  const [totalConnections, setTotalConnections] = useState<number>(0);
  const [totalResourceServers, setTotalResourceServers] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch daily stats
        const fromDate = format(subDays(new Date(), 30), "yyyyMMdd");
        const toDate = format(new Date(), "yyyyMMdd");

        // The dataProvider doesn't have a generic custom endpoint method,
        // so we'll use getList with our custom stats resource
        // First, let's try to get the stats data via a custom fetch
        const statsResponse = await dataProvider.getList("stats/daily", {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "date", order: "ASC" },
          filter: { from: fromDate, to: toDate },
        });
        setStats(statsResponse.data || []);

        // Fetch counts for summary cards
        const [usersResult, clientsResult, connectionsResult, apisResult] =
          await Promise.all([
            dataProvider
              .getList("users", {
                pagination: { page: 1, perPage: 1 },
                sort: { field: "created_at", order: "DESC" },
                filter: {},
              })
              .catch(() => ({ total: 0 })),
            dataProvider
              .getList("clients", {
                pagination: { page: 1, perPage: 1 },
                sort: { field: "created_at", order: "DESC" },
                filter: {},
              })
              .catch(() => ({ total: 0 })),
            dataProvider
              .getList("connections", {
                pagination: { page: 1, perPage: 1 },
                sort: { field: "created_at", order: "DESC" },
                filter: {},
              })
              .catch(() => ({ total: 0 })),
            dataProvider
              .getList("resource-servers", {
                pagination: { page: 1, perPage: 1 },
                sort: { field: "created_at", order: "DESC" },
                filter: {},
              })
              .catch(() => ({ total: 0 })),
          ]);

        setTotalUsers(usersResult.total || 0);
        setTotalClients(clientsResult.total || 0);
        setTotalConnections(connectionsResult.total || 0);
        setTotalResourceServers(apisResult.total || 0);
      } catch (err: any) {
        console.error("Error fetching activity data:", err);
        setError(err.message || "Failed to load activity data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dataProvider]);

  // Transform stats data for charts
  const dailyActiveUsersData = stats.map((s) => ({
    date: s.date,
    value: s.logins,
  }));

  const signupsData = stats.map((s) => ({
    date: s.date,
    value: s.signups,
  }));

  // Calculate user retention (simplified: returning users / total logins)
  // For a proper implementation, this would need session tracking
  const retentionData = stats.map((s, index) => {
    // Simple placeholder retention calculation
    const prevStats = index > 0 ? stats[index - 1] : null;
    const prevLogins = prevStats?.logins ?? 0;
    const retention =
      s.logins > 0 && prevLogins > 0
        ? Math.min(100, Math.round((prevLogins / s.logins) * 100))
        : 0;
    return {
      date: s.date,
      value: retention,
    };
  });

  // Failed logins - we need to calculate this from log types
  // For now, we'll show 0 as we don't have failed login data in daily stats
  const failedLoginsData = stats.map((s) => ({
    date: s.date,
    value: 0, // This would need a separate query for failed logins
  }));

  // Date range display
  const fromDisplay =
    stats.length > 0 && stats[0]?.date
      ? format(parseISO(stats[0].date), "EEE MMM dd yyyy")
      : format(subDays(new Date(), 30), "EEE MMM dd yyyy");
  const toDisplay = format(new Date(), "EEE MMM dd yyyy");

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Activity
      </Typography>

      {/* Summary Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Total Users"
            value={totalUsers}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Applications"
            value={totalClients}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="APIs"
            value={totalResourceServers}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatsCard
            title="Connections"
            value={totalConnections}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Date Range */}
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        {fromDisplay} 00:00:00 GMT+0000 - {toDisplay} 23:59:59 GMT+0000
      </Typography>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Daily Active Users"
            data={dailyActiveUsersData}
            loading={loading}
            color="#1976d2"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="User Retention"
            data={retentionData}
            loading={loading}
            color="#2e7d32"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Signups"
            data={signupsData}
            loading={loading}
            color="#9c27b0"
            showViewLogs
            logsFilter='{"type":"ss"}'
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard
            title="Failed Logins"
            data={failedLoginsData}
            loading={loading}
            color="#d32f2f"
            showViewLogs
            logsFilter='{"type":"f"}'
          />
        </Grid>
      </Grid>
    </Box>
  );
}
