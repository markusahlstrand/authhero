import type {
  EmailServiceAdapter,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

export interface CloudflareEmailAddress {
  email: string;
  name?: string;
}

export interface CloudflareEmailMessage {
  to: string | CloudflareEmailAddress | (string | CloudflareEmailAddress)[];
  from: string | CloudflareEmailAddress;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | CloudflareEmailAddress;
  headers?: Record<string, string>;
}

/**
 * Minimal shape of the Cloudflare Email Sending `send_email` Worker binding.
 * Declared locally rather than depending on `@cloudflare/workers-types` so
 * the adapter package stays runtime-agnostic.
 *
 * Reference: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
export interface CloudflareSendEmailBinding {
  send(message: CloudflareEmailMessage): Promise<{ messageId: string }>;
}

export interface CloudflareEmailServiceOptions {
  binding: CloudflareSendEmailBinding;
  /**
   * Sender on a domain onboarded to Email Sending. When set it replaces the
   * from-address AuthHero resolves per tenant/template.
   */
  from?: string | CloudflareEmailAddress;
  replyTo?: string | CloudflareEmailAddress;
  headers?: Record<string, string>;
}

// AuthHero passes senders either as a bare address or as `Name <address>`.
function parseAddress(value: string): string | CloudflareEmailAddress {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/);
  if (!match) {
    return value.trim();
  }
  const name = match[1]?.trim();
  const email = match[2] ?? "";
  return name ? { email, name } : email;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : "";
    return code ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}

class CloudflareEmailService implements EmailServiceAdapter {
  constructor(private options: CloudflareEmailServiceOptions) {}

  async send(params: EmailServiceSendParams): Promise<void> {
    const { binding, from, replyTo, headers } = this.options;

    const message: CloudflareEmailMessage = {
      to: params.to,
      from: from ?? parseAddress(params.from),
      subject: params.subject,
    };
    if (params.html) message.html = params.html;
    if (params.text) message.text = params.text;
    if (replyTo) message.replyTo = replyTo;
    if (headers && Object.keys(headers).length > 0) message.headers = headers;

    try {
      await binding.send(message);
    } catch (error) {
      throw new Error(
        `Cloudflare Email Sending failed: ${describeError(error)}`,
        { cause: error },
      );
    }
  }
}

export function createCloudflareEmailService(
  options: CloudflareEmailServiceOptions,
): EmailServiceAdapter {
  return new CloudflareEmailService(options);
}
