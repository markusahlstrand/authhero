import { useState } from "react";
import { Braces } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { USER_FIELD_OPTIONS, type UserFieldOption } from "../constants";

interface TemplateValueInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/**
 * Free-text input with a picker for user-attribute templates. Selecting an
 * attribute inserts a {{context.user.…}} reference, which the form engine
 * resolves at render time (e.g. to prefill a field's default value).
 */
export function TemplateValueInput({
  value,
  onChange,
  placeholder,
}: TemplateValueInputProps) {
  const [open, setOpen] = useState(false);

  const grouped = USER_FIELD_OPTIONS.reduce<Record<string, UserFieldOption[]>>(
    (acc, option) => {
      if (!acc[option.group]) acc[option.group] = [];
      acc[option.group].push(option);
      return acc;
    },
    {},
  );

  return (
    <div className="flex gap-1.5">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            title="Insert user attribute"
          >
            <Braces className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="end">
          <Command>
            <CommandInput placeholder="Search user attributes…" />
            <CommandList>
              <CommandEmpty>No attributes match.</CommandEmpty>
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
    </div>
  );
}
