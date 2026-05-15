import { describe, it, expect, vi } from "vitest";
import { PostmarkEmailService } from "../../src/email-services/postmark";
import type {
  EmailProvider,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

function makeProvider(credentials: Record<string, unknown>): EmailProvider {
  return {
    name: "postmark",
    enabled: true,
    credentials,
  };
}

function makeParams(
  overrides: Partial<EmailServiceSendParams> = {},
): EmailServiceSendParams {
  return {
    emailProvider: makeProvider({ api_key: "pm-server-token" }),
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Hello",
    template: "auth-code",
    data: { code: "123456", vendorName: "Acme" },
    html: "<p>Click here</p>",
    text: "Click here",
    ...overrides,
  };
}

function okResponse(): Response {
  return new Response('{"MessageID":"abc","ErrorCode":0}', { status: 200 });
}

describe("PostmarkEmailService", () => {
  it("posts to /email with HtmlBody/TextBody when html is provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new PostmarkEmailService({ fetchImpl });

    await service.send(makeParams());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-Postmark-Server-Token"]).toBe("pm-server-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      From: "noreply@example.com",
      To: "user@example.com",
      Subject: "Hello",
      HtmlBody: "<p>Click here</p>",
      TextBody: "Click here",
    });
  });

  it("posts to /email/withTemplate when html is absent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new PostmarkEmailService({ fetchImpl });

    await service.send(makeParams({ html: undefined, text: undefined }));

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email/withTemplate");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      From: "noreply@example.com",
      To: "user@example.com",
      TemplateAlias: "auth-code",
      TemplateModel: { code: "123456", vendorName: "Acme" },
    });
  });

  it("omits TextBody when text is not provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new PostmarkEmailService({ fetchImpl });

    await service.send(makeParams({ text: undefined }));

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.TextBody).toBeUndefined();
    expect(body.HtmlBody).toBe("<p>Click here</p>");
  });

  it("rejects credentials missing api_key without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const service = new PostmarkEmailService({ fetchImpl });

    await expect(
      service.send(makeParams({ emailProvider: makeProvider({}) })),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws with status code when Postmark responds non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"ErrorCode":10,"Message":"Bad token"}', {
        status: 401,
        statusText: "Unauthorized",
      }),
    );
    const service = new PostmarkEmailService({ fetchImpl });

    await expect(service.send(makeParams())).rejects.toThrow(/401/);
  });
});
