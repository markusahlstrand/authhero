import { describe, it, expect, vi } from "vitest";
import { ResendEmailService } from "../../src/email-services/resend";
import type {
  EmailProvider,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

function makeProvider(credentials: Record<string, unknown>): EmailProvider {
  return {
    name: "resend",
    enabled: true,
    credentials,
  };
}

function makeParams(
  overrides: Partial<EmailServiceSendParams> = {},
): EmailServiceSendParams {
  return {
    emailProvider: makeProvider({ api_key: "re_secret" }),
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
  return new Response('{"id":"abc"}', { status: 200 });
}

describe("ResendEmailService", () => {
  it("posts JSON to the emails endpoint with bearer auth and html/text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new ResendEmailService({ fetchImpl });

    await service.send(makeParams());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_secret");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Click here</p>",
      text: "Click here",
    });
  });

  it("omits html/text when not provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const service = new ResendEmailService({ fetchImpl });

    await service.send(makeParams({ html: undefined, text: undefined }));

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "Hello",
    });
  });

  it("rejects credentials missing api_key without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const service = new ResendEmailService({ fetchImpl });

    await expect(
      service.send(makeParams({ emailProvider: makeProvider({}) })),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws with status code when Resend responds non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"message":"Forbidden"}', {
        status: 401,
        statusText: "Unauthorized",
      }),
    );
    const service = new ResendEmailService({ fetchImpl });

    await expect(service.send(makeParams())).rejects.toThrow(/401/);
  });
});
