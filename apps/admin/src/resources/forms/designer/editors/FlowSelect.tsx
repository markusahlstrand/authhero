import { useState } from "react";
import { useGetList } from "ra-core";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FlowRecord {
  id: string;
  name?: string;
}

interface FlowSelectProps {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
}

const PER_PAGE = 100;

export function FlowSelect({
  label,
  value,
  onChange,
  placeholder = "Select flow",
}: FlowSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // A single page is all a dropdown can usefully show, so the search is sent
  // to the server rather than applied to what happens to have been fetched:
  // otherwise a tenant with more flows than fit on one page could never pick
  // the ones that fall off the end.
  const { data, isPending, error } = useGetList<FlowRecord>("flows", {
    pagination: { page: 1, perPage: PER_PAGE },
    sort: { field: "name", order: "ASC" },
    filter: search ? { q: search } : {},
  });

  const flows = data ?? [];
  // The result set is a page, not the whole list — say so instead of letting
  // it read as "these are all the flows there are".
  const isTruncated = flows.length >= PER_PAGE;

  const hasValue = typeof value === "string" && value.length > 0;
  const selected = hasValue
    ? flows.find((flow) => flow.id === value)
    : undefined;

  // Without a list to pick from there is nothing to select — fall back to the
  // raw id so the node stays editable.
  if (error) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          placeholder="flow_..."
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        <span className="text-xs text-muted-foreground">
          Could not load flows — enter the flow ID manually.
        </span>
      </div>
    );
  }

  // A saved flow_id may point at a flow outside the current result set, or one
  // that was deleted. Show the raw id rather than an empty trigger so opening
  // the node never looks like the reference was dropped.
  const triggerLabel = selected
    ? selected.name || selected.id
    : hasValue
      ? value
      : placeholder;

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between font-normal"
          >
            <span
              className={cn("truncate", !hasValue && "text-muted-foreground")}
            >
              {triggerLabel}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          {/* Filtering happens server-side, so Command must not also filter
              the page it was handed. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search flows…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {isPending ? "Loading flows…" : "No flows match."}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      hasValue ? "opacity-0" : "opacity-100",
                    )}
                  />
                  <span className="flex-1">None</span>
                </CommandItem>
                {hasValue && !selected && (
                  <CommandItem value={value} onSelect={() => setOpen(false)}>
                    <Check className="mr-2 h-3.5 w-3.5 opacity-100" />
                    <span className="flex-1 font-mono text-xs">{value}</span>
                    <span className="text-xs text-muted-foreground">
                      (not in results)
                    </span>
                  </CommandItem>
                )}
                {flows.map((flow) => (
                  <CommandItem
                    key={flow.id}
                    value={flow.id}
                    onSelect={() => {
                      onChange(flow.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === flow.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1">{flow.name || flow.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {isTruncated && (
            <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              Showing the first {PER_PAGE} — search to narrow.
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
