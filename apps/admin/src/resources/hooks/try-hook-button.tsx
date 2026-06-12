import { useState } from "react";
import { useDataProvider, useNotify, useRecordContext } from "ra-core";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AuthHeroDataProvider } from "../../auth0DataProvider";

interface UserSummary {
  id: string | number;
  user_id?: string;
  email?: string;
  name?: string;
  connection?: string;
}

interface TryResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

export function TryHookButton() {
  const record = useRecordContext<{ hook_id?: string; url?: string }>();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);

  if (!record?.hook_id || !record.url) return null;
  const hookId = record.hook_id;

  const reset = () => {
    setSearch("");
    setResults([]);
    setSelectedUserId(null);
    setResult(null);
  };
  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data } = await dataProvider.getList<UserSummary>("users", {
        pagination: { page: 1, perPage: 25 },
        sort: { field: "email", order: "ASC" },
        filter: { q: search },
      });
      setResults(data);
    } catch {
      notify("Error searching for users", { type: "error" });
    } finally {
      setSearching(false);
    }
  };

  const handleTrigger = async () => {
    if (!selectedUserId) return;
    setTriggering(true);
    setResult(null);
    try {
      const response = await dataProvider.tryHook(hookId, {
        user_id: selectedUserId,
      });
      setResult(response);
      if (response.ok) {
        notify(`Webhook responded with ${response.status}`, {
          type: "success",
        });
      } else {
        notify(
          response.error
            ? `Webhook call failed: ${response.error}`
            : `Webhook responded with ${response.status}`,
          { type: "error" },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      notify(`Failed to trigger webhook: ${message}`, { type: "error" });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Play className="size-4 mr-1" />
        Try
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : handleClose())}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Try webhook</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Sends the saved webhook to <code>{record.url}</code> with the
            selected user as payload, exactly like a real trigger. The call is
            recorded in the logs.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Search users by email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doSearch();
                }
              }}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              onClick={doSearch}
              disabled={searching || !search.trim()}
            >
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
              {results.map((user) => {
                const userId = user.user_id || String(user.id);
                const isSelected = selectedUserId === userId;
                return (
                  <button
                    key={userId}
                    type="button"
                    onClick={() => setSelectedUserId(userId)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent ${
                      isSelected ? "bg-accent" : ""
                    }`}
                  >
                    <span>
                      <span className="font-medium">
                        {user.email || user.name || userId}
                      </span>
                      {user.name && user.email && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {user.name}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user.connection}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {result && (
            <div className="rounded-md border p-3 text-sm">
              <div className={result.ok ? "text-green-600" : "text-red-600"}>
                {result.error
                  ? `Request failed: ${result.error}`
                  : `Response: ${result.status}`}
              </div>
              {result.body && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {result.body}
                </pre>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={triggering}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleTrigger}
              disabled={!selectedUserId || triggering}
            >
              {triggering ? "Triggering…" : "Trigger webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
