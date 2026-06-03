import { useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { Liquid } from "liquidjs";

const liquid = new Liquid({
  cache: false,
  strictVariables: false,
  strictFilters: false,
});

const SAMPLE_VARS: Record<string, unknown> = {
  tenant: {
    id: "acme",
    friendly_name: "Acme",
    support_url: "https://support.acme.com",
  },
  branding: {
    logo: "",
    primary_color: "#7d68f4",
  },
  signature: { enabled: true },
  footer: { address: "" },
  url: "https://example.com/verify?ticket=sample-ticket",
  code: "268202",
  kind_regards: "Kind Regards,",
  team_signature: "The Acme Team",
  link_email_fallback_intro:
    "If you prefer, you can also copy and paste the following link into your browser:",
  support_info:
    "If you have questions or need assistance, you can contact our support team",
  contact_us: "Contact us",
  copyright: "© Acme. All rights reserved.",
  // Subject/heading interpolations
  welcome_to_your_account: "Welcome to your Acme account!",
  link_email_click_to_login: "Click the button to log in",
  link_email_login: "Login",
  link_email_or_enter_code: "Or enter the code at Acme to complete the login.",
  code_valid_30_minutes: "The code is valid for 30 minutes",
  password_reset_title: "Change password for your Acme account",
  reset_password_email_click_to_reset: "Click the button to reset your password",
  reset_password_email_reset: "Reset Password",
  welcome_body: "Thanks for signing up. Your account is ready.",
  welcome_cta: "Get started",
  invitation_email_subject: "You've been invited to Acme",
  invitation_email_intro:
    "You've been invited to join Acme on behalf of a team admin.",
  invitation_email_click_to_accept:
    "Click the button below to accept your invitation.",
  invitation_email_accept_button: "Accept invitation",
  invitation_expires_in: "This invitation will expire in 7 days.",
};

interface EmailTemplatePreviewProps {
  isOverride: boolean;
  defaultHtml?: string;
}

export function EmailTemplatePreview({
  isOverride,
  defaultHtml,
}: EmailTemplatePreviewProps) {
  const body = useWatch({ name: "body" }) as string | undefined;
  const enabled = useWatch({ name: "enabled" }) as boolean | undefined;
  const [rendered, setRendered] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(() => {
    if (isOverride && body) return body;
    return defaultHtml ?? "";
  }, [isOverride, body, defaultHtml]);

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setRendered("");
      setError(null);
      return;
    }
    liquid
      .parseAndRender(source, SAMPLE_VARS)
      .then((html) => {
        if (!cancelled) {
          setRendered(html);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setRendered("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const isDisabled = isOverride && enabled === false;

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Preview
        </span>
        <span className="text-[10px] text-muted-foreground">
          Sample data — actual sends use tenant + per-user values
        </span>
      </div>

      <div className="flex flex-1 items-stretch overflow-hidden rounded-md border bg-zinc-100">
        {isDisabled ? (
          <div className="m-auto p-6 text-center text-sm text-muted-foreground">
            This template is disabled — emails for this event will not be sent.
          </div>
        ) : error ? (
          <pre className="m-2 overflow-auto rounded bg-red-50 p-3 text-xs text-red-800">
            {error}
          </pre>
        ) : (
          <iframe
            title="Email preview"
            srcDoc={rendered}
            sandbox=""
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
