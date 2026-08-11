import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { useSessionRetention } from "./useSessionRetention";

const WEEK_OPTIONS = [8, 12, 16, 26];

// Sequential single-hue ramp (blue 100→700), more = darker. Cell fills are
// explicit hexes so they read the same in light and dark mode; the ink is
// flipped per step for contrast.
const RAMP = [
  "#cde2fb",
  "#b7d3f6",
  "#9ec5f4",
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
  "#184f95",
  "#104281",
  "#0d366b",
];

// Square-root scale: weekly retention drops steeply, and a linear mapping
// would leave everything past week 1 nearly white.
function cellStyle(pct: number): { backgroundColor: string; color: string } {
  const idx = Math.min(
    RAMP.length - 1,
    Math.round(Math.sqrt(pct / 100) * (RAMP.length - 1)),
  );
  return {
    backgroundColor: RAMP[idx],
    color: idx >= 6 ? "#ffffff" : "#0b0b0b",
  };
}

function formatPct(pct: number): string {
  if (pct === 0) return "0";
  if (pct < 1) return "<1";
  return String(Math.round(pct));
}

export function SessionRetentionTab() {
  const [weeks, setWeeks] = useState(12);
  const { data, loading, error } = useSessionRetention(weeks);

  const cohorts = data?.cohorts ?? [];
  const maxOffset = Math.max(0, ...cohorts.map((c) => c.active.length - 1));
  const hasSessions = cohorts.some((c) => c.sessions > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <Select
            value={String(weeks)}
            onValueChange={(v) => setWeeks(Number(v))}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_OPTIONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Last {w} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            A session counts as active in week N after creation if it was last
            used during or after that week. Week 0 is the creation week. Weeks
            are Monday-aligned, UTC.
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session retention by weekly cohort</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-72">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !hasSessions ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pr-2 text-right font-medium">Cohort week</th>
                    <th className="pr-2 text-right font-medium">Sessions</th>
                    {Array.from({ length: maxOffset + 1 }, (_, k) => (
                      <th key={k} className="px-1 text-center font-medium">
                        +{k}w
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.cohort}>
                      <td className="pr-2 text-right text-muted-foreground">
                        {c.cohort}
                      </td>
                      <td className="pr-2 text-right text-muted-foreground">
                        {c.sessions.toLocaleString()}
                      </td>
                      {Array.from({ length: maxOffset + 1 }, (_, k) => {
                        if (k >= c.active.length) {
                          return <td key={k} />;
                        }
                        if (c.sessions === 0) {
                          return (
                            <td
                              key={k}
                              className="rounded-sm bg-muted text-center text-muted-foreground"
                            >
                              –
                            </td>
                          );
                        }
                        const pct = (c.active[k] / c.sessions) * 100;
                        return (
                          <td
                            key={k}
                            className="min-w-10 rounded-sm px-1 py-1.5 text-center"
                            style={cellStyle(pct)}
                            title={`${c.cohort} cohort, +${k} weeks: ${c.active[k].toLocaleString()} of ${c.sessions.toLocaleString()} sessions still active (${pct.toFixed(1)}%)`}
                          >
                            {formatPct(pct)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>0%</span>
                <div
                  className="h-2.5 w-40 rounded-full border"
                  style={{
                    background: `linear-gradient(90deg, ${RAMP.join(",")})`,
                  }}
                />
                <span>100%</span>
                <span className="ml-1">
                  (square-root scale — early drop-off stays visible)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
