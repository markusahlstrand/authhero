import { describe, it, expect, vi } from "vitest";
import { MailgunEmailService } from "../../src/email-services/mailgun";
import type {
  EmailProvider,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

function makeProvider(credentials: Record<string, unknown>): EmailProvider {
  return {
    name: "mailgun",
    enabled: true,
    credentials,
  };
}

function makeParams(
  overrides: Partial<EmailServiceSendParams> = {},
): EmailServiceSendParams {
  return {
    emailProvider: makeProvider({
      api_key: "key-secret",
      domain: "mg.example.com",
    }),
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
  return new Response('{"id":"<x@mg>","message":"Queued"}', { status: 200 });
}

describe("MailgunEmailService", () => {
  it("posts to the US host by default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(makeParams());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
  });

  it("posts to the EU host when region is eu", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(
      makeParams({
        emailProvider: makeProvider({
          api_key: "key-secret",
          domain: "mg.example.com",
          region: "eu",
        }),
      }),
    );

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });

  it("posts to the US host when region is us", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(
      makeParams({
        emailProvider: makeProvider({
          api_key: "key-secret",
          domain: "mg.example.com",
          region: "us",
        }),
      }),
    );

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
  });

  it("treats null region as US", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(
      makeParams({
        emailProvider: makeProvider({
          api_key: "key-secret",
          domain: "mg.example.com",
          region: null,
        }),
      }),
    );

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
  });

  it("sends Basic auth, form body, variables, html, and text; omits template when html is set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(makeParams());

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa("api:key-secret")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(init.body as string);
    expect(body.get("from")).toBe("noreply@example.com");
    expect(body.get("to")).toBe("user@example.com");
    expect(body.get("subject")).toBe("Hello");
    expect(body.has("template")).toBe(false);
    expect(JSON.parse(body.get("h:X-Mailgun-Variables") ?? "")).toEqual({
      code: "123456",
      vendorName: "Acme",
    });
    expect(body.get("html")).toBe("<p>Click here</p>");
    expect(body.get("text")).toBe("Click here");
  });

  it("falls back to template when html is not provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new MailgunEmailService({ fetchImpl });

    await service.send(makeParams({ html: undefined, text: undefined }));

    const [, init] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.has("html")).toBe(false);
    expect(body.has("text")).toBe(false);
    expect(body.get("template")).toBe("auth-code");
  });

  it("rejects credentials missing api_key without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const service = new MailgunEmailService({ fetchImpl });

    await expect(
      service.send(
        makeParams({
          emailProvider: makeProvider({ domain: "mg.example.com" }),
        }),
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects domains shorter than 4 characters", async () => {
    const fetchImpl = vi.fn();
    const service = new MailgunEmailService({ fetchImpl });

    await expect(
      service.send(
        makeParams({
          emailProvider: makeProvider({ api_key: "key", domain: "abc" }),
        }),
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws with status code when Mailgun responds non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"message":"Forbidden"}', {
        status: 401,
        statusText: "Unauthorized",
      }),
    );
    const service = new MailgunEmailService({ fetchImpl });

    await expect(service.send(makeParams())).rejects.toThrow(/401/);
  });
});
