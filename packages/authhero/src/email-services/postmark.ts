import { z } from "@hono/zod-openapi";
import type {
  EmailServiceAdapter,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

export const postmarkCredentialsSchema = z.object({
  api_key: z.string().min(1),
});

export type PostmarkCredentials = z.infer<typeof postmarkCredentialsSchema>;

export interface PostmarkEmailServiceOptions {
  fetchImpl?: typeof fetch;
}

export class PostmarkEmailService implements EmailServiceAdapter {
  private readonly options: PostmarkEmailServiceOptions;

  constructor(options: PostmarkEmailServiceOptions = {}) {
    this.options = options;
  }

  async send(params: EmailServiceSendParams): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;

    const credentials = postmarkCredentialsSchema.parse(
      params.emailProvider.credentials,
    );

    const headers: Record<string, string> = {
      "X-Postmark-Server-Token": credentials.api_key,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    let url: string;
    let payload: Record<string, unknown>;

    if (params.html) {
      url = "https://api.postmarkapp.com/email";
      payload = {
        From: params.from,
        To: params.to,
        Subject: params.subject,
        HtmlBody: params.html,
      };
      if (params.text) payload.TextBody = params.text;
    } else {
      url = "https://api.postmarkapp.com/email/withTemplate";
      payload = {
        From: params.from,
        To: params.to,
        TemplateAlias: params.template,
        TemplateModel: params.data,
      };
    }

    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Postmark send failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
      );
    }
  }
}
