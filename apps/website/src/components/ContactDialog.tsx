import { useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "submitting" | "success" | "error";

interface ContactDialogProps {
  /** Trigger button label. */
  children?: ReactNode;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Extra classes for the trigger button (e.g. "w-full"). */
  className?: string;
  /** Labels which tier/context the inquiry came from (sent to Slack). */
  topic?: string;
}

const ContactDialog = ({
  children = "Contact us",
  size = "lg",
  variant = "default",
  className,
  topic = "General",
}: ContactDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const reset = () => {
    setEmail("");
    setMessage("");
    setStatus("idle");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, message, topic }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? "Something went wrong. Please try again.",
        );
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          {children}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {status === "success" ? (
          <div className="text-center py-4">
            <CheckCircle2
              className="h-10 w-10 text-accent mx-auto mb-4"
              strokeWidth={1.5}
            />
            <DialogTitle className="mb-2">
              Thanks — we'll be in touch
            </DialogTitle>
            <DialogDescription>
              We've got your message and someone from the team will reach out
              soon.
            </DialogDescription>
            <Button className="mt-6" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Talk to us</DialogTitle>
              <DialogDescription>
                Tell us a little about what you need and we'll get back to you.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "submitting"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Message (optional)</Label>
                <Textarea
                  id="contact-message"
                  placeholder="What are you looking to do?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={status === "submitting"}
                />
              </div>
              {status === "error" && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Send message"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactDialog;
