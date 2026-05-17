import { useState } from "react";
import { Link as LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";

interface LinkPopoverProps {
  isActive: boolean;
  initialHref?: string;
  onApply: (href: string) => void;
  onClear: () => void;
}

export function LinkPopover({
  isActive,
  initialHref,
  onApply,
  onClear,
}: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState(initialHref ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setHref(initialHref ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Toggle
          size="sm"
          pressed={isActive}
          aria-label="Link"
          onMouseDown={(e) => e.preventDefault()}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="https://"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && href.trim()) {
                e.preventDefault();
                onApply(href.trim());
                setOpen(false);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            {isActive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!href.trim()}
              onClick={() => {
                onApply(href.trim());
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
