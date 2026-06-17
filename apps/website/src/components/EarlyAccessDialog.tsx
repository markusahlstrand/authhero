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

type Status = "idle" | "submitting" | "success" | "error";

interface EarlyAccessDialogProps {
  /** Trigger button label. */
  children?: ReactNode;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Extra classes for the trigger button (e.g. "w-full"). */
  className?: string;
}

const EarlyAccessDialog = ({
  children = "Get Started for Free",
  size = "lg",
  variant = "default",
  className,
}: EarlyAccessDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const reset = () => {
    setEmail("");
    setStatus("idle");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Something went wrong. Please try again.");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
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
            <CheckCircle2 className="h-10 w-10 text-accent mx-auto mb-4" strokeWidth={1.5} />
            <DialogTitle className="mb-2">You're on the list</DialogTitle>
            <DialogDescription>
              Thanks for your interest in AuthHero. We'll be in touch as early access opens up.
            </DialogDescription>
            <Button className="mt-6" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Request early access</DialogTitle>
              <DialogDescription>
                AuthHero Cloud is launching soon. Drop your email and we'll add you to the early
                access queue.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-4">
              <Label htmlFor="early-access-email">Email</Label>
              <Input
                id="early-access-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "submitting"}
              />
              {status === "error" && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Submitting…" : "Join the queue"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EarlyAccessDialog;
