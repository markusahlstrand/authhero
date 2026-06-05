import { useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { useGetOne } from "ra-core";
import { Liquid } from "liquidjs";
import { useTenantId } from "../../TenantContext";

const liquid = new Liquid({
  cache: false,
  strictVariables: false,
  strictFilters: false,
});

interface TenantRecord {
  id: string;
  name?: string;
  friendly_name?: string;
  support_url?: string;
}

interface BrandingRecord {
  logo_url?: string;
  colors?: { primary?: string; page_background?: string };
}

function buildPreviewVars(
  tenant: TenantRecord | undefined,
  branding: BrandingRecord | undefined,
): Record<string, unknown> {
  const friendlyName =
    tenant?.friendly_name || tenant?.name || tenant?.id || "Your tenant";
  const supportUrl = tenant?.support_url || "https://support.example.com";
  const logo = branding?.logo_url || "";
  const primaryColor = branding?.colors?.primary || "#7d68f4";

  return {
    tenant: {
      id: tenant?.id ?? "preview",
      friendly_name: friendlyName,
      support_url: supportUrl,
    },
    branding: {
      logo,
      primary_color: primaryColor,
      button_text_color: "#ffffff",
      button_border_radius: "4px",
    },
    signature: { enabled: true },
    footer: { address: "" },
    url: "https://example.com/verify?ticket=preview-ticket",
    code: "123456",
    kind_regards: "Kind Regards,",
    team_signature: `The ${friendlyName} Team`,
    link_email_fallback_intro:
      "If you prefer, you can also copy and paste the following link into your browser:",
    support_info:
      "If you have questions or need assistance, you can contact our support team",
    contact_us: "Contact us",
    copyright: `© ${friendlyName}. All rights reserved.`,
    welcome_to_your_account: `Welcome to your ${friendlyName} account!`,
    link_email_click_to_login: "Click the button to log in",
    link_email_login: "Login",
    link_email_or_enter_code: `Or enter the code at ${friendlyName} to complete the login.`,
    code_valid_30_minutes: "The code is valid for 30 minutes",
    password_reset_title: `Change password for your ${friendlyName} account`,
    reset_password_email_click_to_reset:
      "Click the button to reset your password",
    reset_password_email_reset: "Reset Password",
    code_email_subject: `Your ${friendlyName} verification code`,
    welcome_body: "Thanks for signing up. Your account is ready.",
    welcome_cta: "Get started",
    invitation_email_subject: `You've been invited to ${friendlyName}`,
    invitation_email_intro: `You've been invited to join ${friendlyName} on behalf of a team admin.`,
    invitation_email_click_to_accept:
      "Click the button below to accept your invitation.",
    invitation_email_accept_button: "Accept invitation",
    invitation_expires_in: "This invitation will expire in 7 days.",
    blocked_account_title: "Your account has been blocked",
    blocked_account_intro: `We detected unusual activity on your ${friendlyName} account and blocked it as a precaution.`,
    blocked_account_unblock_button: "Unblock account",
    stolen_credentials_title: "We detected your credentials in a breach",
    stolen_credentials_intro: `Your credentials for ${friendlyName} appear in a known data breach. Your account is safe, but you should change your password right away.`,
    stolen_credentials_action: "Click the button below to reset your password:",
    enrollment_email_title: "Set up multi-factor authentication",
    enrollment_email_intro: `To finish securing your ${friendlyName} account, enrol a second factor for sign-in.`,
    enrollment_email_button: "Set up MFA",
    mfa_oob_code_title: "Your verification code",
    mfa_oob_code_intro: "Use the code below to complete sign-in:",
    password_reset_notification_title: "Your password was changed",
    password_reset_notification_intro: `The password on your ${friendlyName} account was just changed.`,
    password_reset_notification_followup:
      "If this wasn't you, please contact support immediately.",
  };
}

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
  const tenantId = useTenantId();
  const { data: tenant } = useGetOne<TenantRecord>(
    "tenants",
    { id: tenantId ?? "" },
    { enabled: !!tenantId, retry: false },
  );
  const { data: branding } = useGetOne<BrandingRecord & { id: string }>(
    "branding",
    { id: "branding" },
    { retry: false },
  );
  const [rendered, setRendered] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(() => {
    if (body && body.trim()) return body;
    return defaultHtml ?? "";
  }, [body, defaultHtml]);

  const vars = useMemo(
    () => buildPreviewVars(tenant, branding),
    [tenant, branding],
  );

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setRendered("");
      setError(null);
      return;
    }
    liquid
      .parseAndRender(source, vars)
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
  }, [source, vars]);

  const isDisabled = isOverride && enabled === false;

  return (
    <div className="flex h-full flex-col gap-2 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Preview
        </span>
        <span className="text-[10px] text-muted-foreground">
          Live tenant + branding data; placeholder code/url
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
