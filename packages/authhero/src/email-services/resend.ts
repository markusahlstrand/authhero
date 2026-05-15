import { z } from "@hono/zod-openapi";
import type {
  EmailServiceAdapter,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

export const resendCredentialsSchema = z.object({
  api_key: z.string().min(1),
});

export type ResendCredentials = z.infer<typeof resendCredentialsSchema>;

export interface ResendEmailServiceOptions {
  fetchImpl?: typeof fetch;
}

export class ResendEmailService implements EmailServiceAdapter {
  private readonly options: ResendEmailServiceOptions;

  constructor(options: ResendEmailServiceOptions = {}) {
    this.options = options;
  }

  async send(params: EmailServiceSendParams): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;

    const credentials = resendCredentialsSchema.parse(
      params.emailProvider.credentials,
    );

    const payload: Record<string, unknown> = {
      from: params.from,
      to: params.to,
      subject: params.subject,
    };
    if (params.html) payload.html = params.html;
    if (params.text) payload.text = params.text;

    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Resend send failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
      );
    }
  }
}
