import { z } from "@hono/zod-openapi";
import type {
  EmailServiceAdapter,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

// Auth0's Management API documents region as "eu" | null (null = US), but
// customers commonly send explicit "us" too — accept both.
export const mailgunCredentialsSchema = z.object({
  api_key: z.string().min(1),
  domain: z.string().min(4),
  region: z.enum(["eu", "us"]).nullish(),
});

export type MailgunCredentials = z.infer<typeof mailgunCredentialsSchema>;

export interface MailgunEmailServiceOptions {
  fetchImpl?: typeof fetch;
}

export class MailgunEmailService implements EmailServiceAdapter {
  private readonly options: MailgunEmailServiceOptions;

  constructor(options: MailgunEmailServiceOptions = {}) {
    this.options = options;
  }

  async send(params: EmailServiceSendParams): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;

    const credentials = mailgunCredentialsSchema.parse(
      params.emailProvider.credentials,
    );

    const host =
      credentials.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
    const url = `https://${host}/v3/${encodeURIComponent(credentials.domain)}/messages`;

    const body = new URLSearchParams();
    body.append("from", params.from);
    body.append("to", params.to);
    body.append("subject", params.subject);
    body.append("h:X-Mailgun-Variables", JSON.stringify(params.data));
    if (params.html) {
      body.append("html", params.html);
    } else {
      body.append("template", params.template);
    }
    if (params.text) body.append("text", params.text);

    const auth = btoa(`api:${credentials.api_key}`);

    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Mailgun send failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
      );
    }
  }
}
