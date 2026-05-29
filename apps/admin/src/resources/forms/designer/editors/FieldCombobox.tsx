import { useState } from "react";
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
import { cn } from "@/lib/utils";

import { ROUTER_FIELD_OPTIONS, type RouterFieldOption } from "../constants";

interface FieldComboboxProps {
  value: string | undefined;
  onChange: (next: string) => void;
}

export function FieldCombobox({ value, onChange }: FieldComboboxProps) {
  const [open, setOpen] = useState(false);

  const grouped = ROUTER_FIELD_OPTIONS.reduce<
    Record<string, RouterFieldOption[]>
  >((acc, option) => {
    if (!acc[option.group]) acc[option.group] = [];
    acc[option.group].push(option);
    return acc;
  }, {});

  const selected = ROUTER_FIELD_OPTIONS.find((opt) => opt.value === value);

  return (
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
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected ? selected.label : value || "Select or type field"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search fields…"
            onValueChange={(v) => {
              if (v && !ROUTER_FIELD_OPTIONS.some((o) => o.value === v)) {
                // user is typing a custom field; we apply on Enter via item
              }
            }}
          />
          <CommandList>
            <CommandEmpty>No fields match.</CommandEmpty>
            {Object.entries(grouped).map(([group, opts]) => (
              <CommandGroup key={group} heading={group}>
                {opts.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1">{option.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {option.value}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
