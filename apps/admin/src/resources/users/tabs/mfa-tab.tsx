import { useCallback, useEffect, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
} from "ra-core";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRecord } from "./types";

interface MfaEnrollment {
  id: string;
  type: string;
  phone_number?: string;
  confirmed?: boolean;
  created_at?: string;
}

interface EnrollmentTicketResponse {
  ticket_url: string;
}

export function MfaTab() {
  const { id: userId } = useParams();
  const record = useRecordContext<UserRecord>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [enrollments, setEnrollments] = useState<MfaEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [sendingTicket, setSendingTicket] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await dataProvider.getList<MfaEnrollment>(
        `users/${userId}/authentication-methods`,
        {
          pagination: { page: 1, perPage: 100 },
          sort: { field: "created_at", order: "DESC" },
          filter: {},
        },
      );
      setEnrollments(res.data);
    } catch {
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  }, [userId, dataProvider]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      await dataProvider.delete(`users/${userId}/authentication-methods`, {
        id,
      });
      notify("MFA enrollment deleted", { type: "success" });
      load();
    } catch {
      notify("Failed to delete MFA enrollment", { type: "error" });
    }
  };

  const handleCreateTicket = async () => {
    if (!userId) return;
    setSendingTicket(true);
    try {
      const response = await dataProvider.create<
        EnrollmentTicketResponse & { id: string }
      >("guardian/enrollments/ticket", {
        data: { user_id: userId, email: record?.email },
      });
      setTicketUrl(response.data.ticket_url);
      setTicketDialogOpen(true);
    } catch {
      notify("Failed to create enrollment ticket", { type: "error" });
    } finally {
      setSendingTicket(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="outline"
          onClick={handleCreateTicket}
          disabled={sendingTicket}
        >
          <Plus className="h-4 w-4 mr-1" />
          Create enrollment ticket
        </Button>
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No MFA enrollments found for this user.
        </p>
      ) : (
        <ul className="divide-y border rounded-md">
          {enrollments.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between p-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {(e.type === "phone" ? "SMS" : e.type.toUpperCase())} —{" "}
                  {e.phone_number || "N/A"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {e.confirmed ? "Confirmed" : "Pending"}
                  {e.created_at
                    ? ` · Created ${new Date(e.created_at).toLocaleDateString()}`
                    : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete enrollment"
                onClick={() => handleDelete(e.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>MFA enrollment ticket</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Share this URL with the user to enroll in MFA:
          </p>
          <Input readOnly value={ticketUrl ?? ""} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!ticketUrl) return;
                navigator.clipboard
                  .writeText(ticketUrl)
                  .then(() => notify("Copied to clipboard", { type: "success" }))
                  .catch(() =>
                    notify("Failed to copy to clipboard", { type: "warning" }),
                  );
              }}
            >
              Copy URL
            </Button>
            <Button onClick={() => setTicketDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
