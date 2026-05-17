import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";

import {
  COMPONENT_CATEGORIES,
  COMPONENT_TYPE_OPTIONS,
} from "../constants";

interface AddComponentMenuProps {
  onAdd: (componentType: string) => void;
}

export function AddComponentMenu({ onAdd }: AddComponentMenuProps) {
  const grouped = Object.entries(COMPONENT_CATEGORIES).map(
    ([categoryKey, label]) => ({
      categoryKey,
      label,
      items: COMPONENT_TYPE_OPTIONS.filter(
        (opt) => opt.category === categoryKey,
      ),
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5" />
          Add component
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[420px] overflow-auto">
        {grouped.map((group, idx) => (
          <div key={group.categoryKey}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((option) => (
              <DropdownMenuItem
                key={option.type}
                onSelect={() => onAdd(option.type)}
                className="flex items-center justify-between"
              >
                <span>{option.label}</span>
                {!option.bespoke && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    JSON
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
