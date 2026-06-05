import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { useDataProvider, useGetIdentity, useNotify } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send } from "lucide-react";
import type { AuthHeroDataProvider } from "../../auth0DataProvider";

interface SendTestButtonProps {
  templateName: string;
}

export function SendTestButton({ templateName }: SendTestButtonProps) {
  const { getValues } = useFormContext();
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const { data: identity } = useGetIdentity();

  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  const handleOpen = () => {
    const initial =
      typeof identity?.fullName === "string" && identity.fullName.includes("@")
        ? identity.fullName
        : (identity as { email?: string } | undefined)?.email || "";
    setTo(initial);
    setOpen(true);
  };

  const handleSend = async () => {
    const trimmedTo = String(to).trim();
    if (!trimmedTo) return;
    setSending(true);
    try {
      const values = getValues();
      const trimmedBody =
        typeof values.body === "string" ? values.body.trim() : "";
      const trimmedSubject =
        typeof values.subject === "string" ? values.subject.trim() : "";
      const trimmedFrom =
        typeof values.from === "string" ? values.from.trim() : "";
      await dataProvider.sendTestEmailTemplate(templateName, {
        to: trimmedTo,
        body: trimmedBody !== "" ? trimmedBody : undefined,
        subject: trimmedSubject !== "" ? trimmedSubject : undefined,
        from: trimmedFrom !== "" ? trimmedFrom : undefined,
      });
      notify(`Test email sent to ${trimmedTo}`, { type: "success" });
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      notify(`Test email failed: ${message}`, { type: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={handleOpen}>
        <Send className="size-4 mr-1" />
        Send test
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Renders the current (unsaved) subject and body with sample data and
            sends it via the tenant's email provider. The subject is prefixed
            with <code>[TEST]</code>.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="test-email-to">Recipient</Label>
            <Input
              id="test-email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={!to || sending}
            >
              {sending ? "Sending…" : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
