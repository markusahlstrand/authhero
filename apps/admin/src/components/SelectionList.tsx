import { useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface SelectionListItem {
  /** Stable unique key; also namespaces the checkbox id. */
  key: string;
  /** Primary label line. */
  primary: ReactNode;
  /** Optional secondary line; rendered only when truthy. */
  secondary?: ReactNode;
  /** Text matched (case-insensitively) against the search query. */
  searchText: string;
}

interface SelectionListProps {
  items: SelectionListItem[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  loading?: boolean;
  /** Shown when not loading and there are no items at all. */
  emptyMessage: ReactNode;
  /** Shown when a search query matches none of the items. */
  noMatchesMessage?: ReactNode;
  searchPlaceholder?: string;
  /** Reveal the search box only once the list exceeds this many items. */
  searchThreshold?: number;
  /** Namespaces checkbox ids so multiple lists on a page don't collide. */
  idPrefix?: string;
}

/**
 * Checkbox multi-select list with client-side search — the shared body of the
 * admin "add X" dialogs (permissions, organizations, roles). The caller owns
 * loading the items and the selected Set; this renders the list, the >N search
 * box, and the loading / empty / no-match states.
 *
 * Search state is internal. To reset it when the underlying list changes (e.g.
 * a two-step dialog switching resource server), give the element a React `key`
 * so it remounts.
 */
export function SelectionList({
  items,
  selected,
  onToggle,
  loading = false,
  emptyMessage,
  noMatchesMessage = "No matches",
  searchPlaceholder = "Search",
  searchThreshold = 5,
  idPrefix = "sel",
}: SelectionListProps) {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => item.searchText.toLowerCase().includes(q))
    : items;

  return (
    <>
      {items.length > searchThreshold && (
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="max-h-72 overflow-auto border rounded-md">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {noMatchesMessage}
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((item) => (
              <li key={item.key} className="flex items-start gap-2 p-2">
                <Checkbox
                  id={`${idPrefix}-${item.key}`}
                  checked={selected.has(item.key)}
                  onCheckedChange={() => onToggle(item.key)}
                />
                <label
                  htmlFor={`${idPrefix}-${item.key}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="text-sm font-medium">{item.primary}</div>
                  {item.secondary && (
                    <div className="text-xs text-muted-foreground">
                      {item.secondary}
                    </div>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
