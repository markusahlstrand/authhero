import { useEffect, useState } from "react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface TimeRange {
  from: Date;
  to: Date;
}

const QUICK_PRESETS: Array<{ label: string; days: number }> = [
  { label: "Last 24h", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/**
 * Rolling preset range ending now — keeps the previous page's behaviour.
 *
 * Note: presets intentionally return a *rolling* range whose `to` is the
 * current instant (and `from` is N days before it), so the window advances as
 * time passes. This differs from custom calendar selections, which normalize to
 * day boundaries (startOfDay/endOfDay). The two behaviours are deliberately
 * distinct: presets track "the last N days up to now", while a hand-picked range
 * means "these whole calendar days".
 */
export function presetRange(days: number, now: Date = new Date()): TimeRange {
  return { from: subDays(now, days), to: now };
}

function formatRangeLabel({ from, to }: TimeRange): string {
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
}

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  // Keep the calendar selection in sync when the range changes externally
  // (e.g. a quick preset is picked).
  useEffect(() => {
    setDraft({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  function applyPreset(days: number) {
    onChange(presetRange(days));
    setOpen(false);
  }

  function applyCustom() {
    if (draft?.from && draft?.to) {
      onChange({ from: startOfDay(draft.from), to: endOfDay(draft.to) });
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarIcon className="h-4 w-4" />
          {formatRangeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row gap-1 border-b p-2 sm:flex-col sm:border-b-0 sm:border-r">
            {QUICK_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={subDays(value.to, 31)}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
            />
            <div className="flex justify-end gap-2 border-t p-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from || !draft?.to}
                onClick={applyCustom}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
